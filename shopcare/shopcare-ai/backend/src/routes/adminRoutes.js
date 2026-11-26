const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');
const { processRefund } = require('../services/refundService');
const { UUID_REGEX } = require('../services/orderService');

const router = express.Router();
router.use(requireAuth, requireRole('staff'));

const statusUpdateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'escalated', 'resolved', 'closed']),
  note: z.string().trim().max(2000).optional(),
});

const escalationDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'more_info_requested']),
  internal_note: z.string().trim().max(2000).optional().default(''),
  refund_amount: z.number().positive().optional(),
  customer_message: z.string().trim().max(2000).optional(),
});

const refundDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(1000).optional().default(''),
});

router.get('/tickets', async (req, res, next) => {
  try {
    const { status, priority, escalated, search } = req.query;
    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (priority && priority !== 'all') {
      params.push(priority);
      conditions.push(`t.priority = $${params.length}`);
    }
    if (escalated === 'true') {
      conditions.push(`EXISTS (SELECT 1 FROM escalations e WHERE e.ticket_id = t.id)`);
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      const idx = params.length;
      conditions.push(
        `(t.ticket_number ILIKE $${idx} OR t.subject ILIKE $${idx} OR u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR COALESCE(o.order_number, '') ILIKE $${idx})`
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT t.*,
             u.name AS customer_name,
             u.email AS customer_email,
             o.order_number,
             o.total_amount AS order_total,
             o.status AS order_status,
             (SELECT decision FROM escalations e WHERE e.ticket_id = t.id ORDER BY e.created_at DESC LIMIT 1) AS escalation_decision,
             (SELECT id FROM escalations e WHERE e.ticket_id = t.id ORDER BY e.created_at DESC LIMIT 1) AS escalation_id,
             (SELECT status FROM refunds r WHERE r.ticket_id = t.id ORDER BY r.created_at DESC LIMIT 1) AS refund_status
      FROM tickets t
      JOIN users u ON u.id = t.customer_id
      LEFT JOIN orders o ON o.id = t.order_id
      ${whereClause}
      ORDER BY
        CASE WHEN t.status = 'escalated' THEN 0 ELSE 1 END,
        t.updated_at DESC
    `;

    const result = await query(sql, params);
    return res.json({ tickets: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.get('/tickets/:id', async (req, res, next) => {
  try {
    const ticketId = req.params.id;
    if (!UUID_REGEX.test(ticketId)) {
      throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
    }

    const tRes = await query(
      `SELECT t.*,
              u.name AS customer_name, u.email AS customer_email,
              o.order_number, o.status AS order_status, o.total_amount AS order_total,
              o.delivery_date AS order_delivery_date, o.item_details AS order_item_details
       FROM tickets t
       JOIN users u ON u.id = t.customer_id
       LEFT JOIN orders o ON o.id = t.order_id
       WHERE t.id = $1`,
      [ticketId]
    );

    if (tRes.rows.length === 0) {
      throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
    }

    const [messagesRes, refundsRes, escalationsRes] = await Promise.all([
      query('SELECT * FROM messages WHERE ticket_id = $1 ORDER BY created_at ASC', [ticketId]),
      query('SELECT * FROM refunds WHERE ticket_id = $1 ORDER BY created_at DESC', [ticketId]),
      query('SELECT * FROM escalations WHERE ticket_id = $1 ORDER BY created_at DESC', [ticketId]),
    ]);

    const entityIds = [
      ticketId,
      ...refundsRes.rows.map((r) => r.id),
      ...escalationsRes.rows.map((e) => e.id),
    ];

    const auditRes = await query(
      `SELECT a.*, u.name AS actor_name, u.role AS actor_role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.entity_id = ANY($1::uuid[])
       ORDER BY a.created_at DESC`,
      [entityIds]
    );

    return res.json({
      ticket: tRes.rows[0],
      messages: messagesRes.rows,
      refunds: refundsRes.rows,
      escalations: escalationsRes.rows,
      audit_logs: auditRes.rows,
    });
  } catch (err) {
    return next(err);
  }
});

router.patch('/tickets/:id/status', validateBody(statusUpdateSchema), async (req, res, next) => {
  try {
    const ticketId = req.params.id;
    if (!UUID_REGEX.test(ticketId)) {
      throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
    }

    const { status, note } = req.validatedBody;
    const updated = await withTransaction(async (client) => {
      const tRes = await client.query(
        `UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, ticketId]
      );
      if (tRes.rows.length === 0) {
        throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
      }

      if (note) {
        await client.query(
          `INSERT INTO messages (ticket_id, sender_type, content, metadata)
           VALUES ($1, 'system', $2, $3)`,
          [ticketId, `Staff updated ticket status to "${status}": ${note}`, JSON.stringify({ staff_id: req.user.id })]
        );
      }

      await recordAudit(client, {
        entityType: 'ticket',
        entityId: ticketId,
        action: 'ticket.status_updated',
        actorId: req.user.id,
        details: { status, note: note || null },
      });

      return tRes.rows[0];
    });

    return res.json({ ticket: updated });
  } catch (err) {
    return next(err);
  }
});

router.post(
  '/escalations/:id/decision',
  validateBody(escalationDecisionSchema),
  async (req, res, next) => {
    try {
      const escalationId = req.params.id;
      if (!UUID_REGEX.test(escalationId)) {
        throw new AppError(404, 'Escalation not found', 'ESCALATION_NOT_FOUND');
      }

      const { decision, internal_note, refund_amount, customer_message } = req.validatedBody;

      const result = await withTransaction(async (client) => {
        const escRes = await client.query('SELECT * FROM escalations WHERE id = $1 FOR UPDATE', [
          escalationId,
        ]);
        if (escRes.rows.length === 0) {
          throw new AppError(404, 'Escalation not found', 'ESCALATION_NOT_FOUND');
        }
        const esc = escRes.rows[0];

        if (!['pending', 'more_info_requested'].includes(esc.decision)) {
          throw new AppError(409, `Escalation was already ${esc.decision}`, 'ALREADY_DECIDED');
        }

        const ticketRes = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [
          esc.ticket_id,
        ]);
        const ticket = ticketRes.rows[0];

        const updEsc = await client.query(
          `UPDATE escalations
           SET decision = $1,
               internal_note = $2,
               assigned_to = $3,
               updated_at = NOW()
           WHERE id = $4
           RETURNING *`,
          [decision, internal_note || esc.internal_note || '', req.user.id, escalationId]
        );

        let createdRefund = null;
        let nextTicketStatus = ticket.status;
        let systemText = customer_message;

        if (decision === 'approved') {
          if (!ticket.order_id) {
            throw new AppError(
              400,
              'This ticket has no linked order, so no refund can be issued.',
              'NO_LINKED_ORDER'
            );
          }
          nextTicketStatus = 'resolved';
          if (ticket.order_id) {
            const orderRes = await client.query('SELECT * FROM orders WHERE id = $1', [
              ticket.order_id,
            ]);
            const order = orderRes.rows[0];
            if (order) {
              const existingRefund = await client.query(
                `SELECT * FROM refunds WHERE order_id = $1 AND status IN ('pending', 'approved') LIMIT 1`,
                [order.id]
              );
              if (existingRefund.rows.length === 0) {
                const refundRes = await processRefund({
                  orderIdentifier: order.id,
                  ticketId: ticket.id,
                  amount: refund_amount || Number(order.total_amount),
                  reason: internal_note || `Staff approved escalated refund (${ticket.ticket_number})`,
                  idempotencyKey: `staff-esc-refund-${escalationId}`,
                  actorUser: req.user,
                  dbClient: client,
                });
                createdRefund = refundRes.refund;
              } else {
                createdRefund = existingRefund.rows[0];
              }
            }
          }
          systemText =
            systemText ||
            `Support staff reviewed and approved your escalated request.${
              createdRefund ? ` Refund of ₹${Number(createdRefund.amount).toFixed(2)} is approved.` : ''
            }`;
        } else if (decision === 'rejected') {
          nextTicketStatus = 'closed';
          systemText =
            systemText ||
            'Support staff reviewed your escalated request and was unable to approve the refund under store policy.';
        } else {
          nextTicketStatus = 'in_progress';
          systemText =
            systemText ||
            'Support staff reviewed your case and requested additional details. Please reply in this chat with any photos or details.';
        }

        await client.query(`UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2`, [
          nextTicketStatus,
          ticket.id,
        ]);

        await client.query(
          `INSERT INTO messages (ticket_id, sender_type, content, metadata)
           VALUES ($1, 'staff', $2, $3)`,
          [
            ticket.id,
            systemText,
            JSON.stringify({ escalation_id: escalationId, decision, reviewed_by: req.user.name }),
          ]
        );

        await recordAudit(client, {
          entityType: 'escalation',
          entityId: escalationId,
          action: `escalation.${decision}`,
          actorId: req.user.id,
          details: {
            ticket_id: ticket.id,
            internal_note,
            refund_id: createdRefund ? createdRefund.id : null,
          },
        });

        return {
          escalation: updEsc.rows[0],
          refund: createdRefund,
          ticket_status: nextTicketStatus,
        };
      });

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
);

router.post('/refunds/:id/decision', validateBody(refundDecisionSchema), async (req, res, next) => {
  try {
    const refundId = req.params.id;
    if (!UUID_REGEX.test(refundId)) {
      throw new AppError(404, 'Refund not found', 'REFUND_NOT_FOUND');
    }

    const { decision, note } = req.validatedBody;
    const updated = await withTransaction(async (client) => {
      const currentRes = await client.query('SELECT * FROM refunds WHERE id = $1 FOR UPDATE', [
        refundId,
      ]);
      if (currentRes.rows.length === 0) {
        throw new AppError(404, 'Refund not found', 'REFUND_NOT_FOUND');
      }
      const current = currentRes.rows[0];
      if (current.status === decision) {
        throw new AppError(409, `Refund is already ${current.status}`, 'ALREADY_DECIDED');
      }
      if (current.status === 'rejected') {
        throw new AppError(409, 'A rejected refund cannot be changed', 'ALREADY_DECIDED');
      }

      const refRes = await client.query(
        `UPDATE refunds
         SET status = $1, reviewed_by = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [decision, req.user.id, refundId]
      );
      const refund = refRes.rows[0];

      await client.query(
        `INSERT INTO messages (ticket_id, sender_type, content, metadata)
         VALUES ($1, 'system', $2, $3)`,
        [
          refund.ticket_id,
          `Staff ${decision} the refund of ₹${Number(refund.amount).toFixed(2)}.`,
          JSON.stringify({ refund_id: refund.id, decision }),
        ]
      );

      await recordAudit(client, {
        entityType: 'refund',
        entityId: refundId,
        action: `refund.${decision}`,
        actorId: req.user.id,
        details: { note, previous_status: current.status },
      });

      return refund;
    });

    return res.json({ refund: updated });
  } catch (err) {
    return next(err);
  }
});

router.get('/audit-logs', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT a.*, u.name AS actor_name, u.role AS actor_role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );
    return res.json({ audit_logs: result.rows });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
