const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { query, withTransaction } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { AppError } = require('../middleware/errorHandler');
const { getOrderDetails, UUID_REGEX } = require('../services/orderService');
const { runSupportAgent } = require('../services/aiAgentService');

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many messages, please slow down', code: 'RATE_LIMITED' },
});

function newTicketNumber() {
  return `TKT-${String(crypto.randomInt(0, 100000000)).padStart(8, '0')}`;
}

const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(255),
  description: z.string().trim().min(3).max(4000),
  category: z.string().trim().min(2).max(80).default('Refund Request'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  order_id: z.string().trim().optional().nullable(),
});

const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

function createTicketRouter(agentRunner = runSupportAgent) {
  const r = express.Router();
  r.use(requireAuth);

  r.get('/', async (req, res, next) => {
    try {
      const sql =
        req.user.role === 'staff'
          ? `SELECT t.*, o.order_number, u.name AS customer_name
             FROM tickets t
             LEFT JOIN orders o ON o.id = t.order_id
             JOIN users u ON u.id = t.customer_id
             ORDER BY t.updated_at DESC`
          : `SELECT t.*, o.order_number,
                    (SELECT status FROM refunds r WHERE r.ticket_id = t.id ORDER BY r.created_at DESC LIMIT 1) AS refund_status,
                    (SELECT amount FROM refunds r WHERE r.ticket_id = t.id ORDER BY r.created_at DESC LIMIT 1) AS refund_amount,
                    (SELECT decision FROM escalations e WHERE e.ticket_id = t.id ORDER BY e.created_at DESC LIMIT 1) AS escalation_decision
             FROM tickets t
             LEFT JOIN orders o ON o.id = t.order_id
             WHERE t.customer_id = $1
             ORDER BY t.updated_at DESC`;

      const params = req.user.role === 'staff' ? [] : [req.user.id];
      const result = await query(sql, params);
      return res.json({ tickets: result.rows });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/', aiLimiter, validateBody(createTicketSchema), async (req, res, next) => {
    try {
      const { subject, description, category, priority, order_id } = req.validatedBody;
      let resolvedOrderId = null;
      let resolvedOrderNumber = null;

      if (order_id) {
        const order = await getOrderDetails({
          orderIdentifier: order_id,
          customerId: req.user.id,
          role: req.user.role,
        });
        resolvedOrderId = order.id;
        resolvedOrderNumber = order.order_number;
      }

      let created = null;
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        try {
          created = await withTransaction(async (client) => {
            const tRes = await client.query(
              `INSERT INTO tickets (ticket_number, customer_id, order_id, subject, description, category, status, priority)
               VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)
               RETURNING *`,
              [newTicketNumber(), req.user.id, resolvedOrderId, subject, description, category, priority]
            );
            const ticket = tRes.rows[0];

            const msgRes = await client.query(
              `INSERT INTO messages (ticket_id, sender_type, content, metadata)
               VALUES ($1, 'customer', $2, '{}'::jsonb)
               RETURNING *`,
              [ticket.id, description]
            );

            return { ticket, initialMessage: msgRes.rows[0] };
          });
        } catch (err) {
          const taken = err.code === '23505' && err.constraint === 'tickets_ticket_number_key';
          if (!taken || attempt === 4) throw err;
        }
      }

      const agentOutput = await agentRunner({
        ticket: { ...created.ticket, order_number: resolvedOrderNumber },
        customerMessage: description,
        history: [created.initialMessage],
        user: req.user,
      });

      const aiMsgRes = await query(
        `INSERT INTO messages (ticket_id, sender_type, content, metadata)
         VALUES ($1, 'ai', $2, $3)
         RETURNING *`,
        [created.ticket.id, agentOutput.reply, JSON.stringify(agentOutput.metadata || {})]
      );

      const refreshedTicket = await query(
        `SELECT t.*, o.order_number FROM tickets t LEFT JOIN orders o ON o.id = t.order_id WHERE t.id = $1`,
        [created.ticket.id]
      );

      return res.status(201).json({
        ticket: refreshedTicket.rows[0],
        messages: [created.initialMessage, aiMsgRes.rows[0]],
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/:id', async (req, res, next) => {
    try {
      const ticketId = req.params.id;
      if (!UUID_REGEX.test(ticketId)) {
        throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
      }

      const tRes = await query(
        `SELECT t.*, o.order_number, o.status AS order_status, o.total_amount AS order_total,
                o.delivery_date AS order_delivery_date, o.item_details AS order_item_details
         FROM tickets t
         LEFT JOIN orders o ON o.id = t.order_id
         WHERE t.id = $1`,
        [ticketId]
      );
      if (tRes.rows.length === 0) {
        throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
      }
      const ticket = tRes.rows[0];
      if (req.user.role !== 'staff' && ticket.customer_id !== req.user.id) {
        throw new AppError(403, 'Forbidden: cannot access another customer ticket', 'FORBIDDEN');
      }

      const [msgRes, refRes, escRes] = await Promise.all([
        query('SELECT * FROM messages WHERE ticket_id = $1 ORDER BY created_at ASC', [ticket.id]),
        query('SELECT * FROM refunds WHERE ticket_id = $1 ORDER BY created_at DESC', [ticket.id]),
        query('SELECT * FROM escalations WHERE ticket_id = $1 ORDER BY created_at DESC', [ticket.id]),
      ]);

      const escalations =
        req.user.role === 'staff'
          ? escRes.rows
          : escRes.rows.map(({ internal_note, assigned_to, ...visible }) => visible);

      return res.json({
        ticket,
        messages: msgRes.rows,
        refunds: refRes.rows,
        escalations,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/:id/messages', aiLimiter, validateBody(createMessageSchema), async (req, res, next) => {
    try {
      const ticketId = req.params.id;
      if (!UUID_REGEX.test(ticketId)) {
        throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
      }

      const tRes = await query(
        `SELECT t.*, o.order_number
         FROM tickets t
         LEFT JOIN orders o ON o.id = t.order_id
         WHERE t.id = $1`,
        [ticketId]
      );
      if (tRes.rows.length === 0) {
        throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
      }
      const ticket = tRes.rows[0];

      if (req.user.role !== 'staff' && ticket.customer_id !== req.user.id) {
        throw new AppError(403, 'Forbidden: cannot post to another customer ticket', 'FORBIDDEN');
      }

      const { content } = req.validatedBody;
      const senderType = req.user.role === 'staff' ? 'staff' : 'customer';

      const msgRes = await query(
        `INSERT INTO messages (ticket_id, sender_type, content, metadata)
         VALUES ($1, $2, $3, '{}'::jsonb)
         RETURNING *`,
        [ticket.id, senderType, content]
      );
      const userMessage = msgRes.rows[0];

      if (senderType === 'staff') {
        await query(`UPDATE tickets SET updated_at = NOW() WHERE id = $1`, [ticket.id]);
        return res.status(201).json({ message: userMessage, aiMessage: null });
      }

      const historyRes = await query(
        'SELECT * FROM messages WHERE ticket_id = $1 ORDER BY created_at ASC',
        [ticket.id]
      );

      const agentOutput = await agentRunner({
        ticket,
        customerMessage: content,
        history: historyRes.rows,
        user: req.user,
      });

      const aiRes = await query(
        `INSERT INTO messages (ticket_id, sender_type, content, metadata)
         VALUES ($1, 'ai', $2, $3)
         RETURNING *`,
        [ticket.id, agentOutput.reply, JSON.stringify(agentOutput.metadata || {})]
      );

      const updatedTicketRes = await query(
        `SELECT t.*, o.order_number FROM tickets t LEFT JOIN orders o ON o.id = t.order_id WHERE t.id = $1`,
        [ticket.id]
      );

      return res.status(201).json({
        message: userMessage,
        aiMessage: aiRes.rows[0],
        ticket: updatedTicketRes.rows[0],
      });
    } catch (err) {
      return next(err);
    }
  });

  return r;
}

router.use('/', createTicketRouter());

module.exports = router;
module.exports.createTicketRouter = createTicketRouter;
