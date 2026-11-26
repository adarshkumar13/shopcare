const express = require('express');
const { z } = require('zod');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { processRefund } = require('../services/refundService');

const router = express.Router();
router.use(requireAuth);

const createRefundSchema = z.object({
  order_id: z.string().trim().min(1),
  ticket_id: z.string().uuid(),
  amount: z.number().positive().optional(),
  reason: z.string().trim().min(3).max(1000),
  idempotency_key: z.string().trim().min(4).max(128),
});

router.get('/', async (req, res, next) => {
  try {
    const sql =
      req.user.role === 'staff'
        ? `SELECT r.*, o.order_number, t.ticket_number, u.name AS customer_name
           FROM refunds r
           JOIN orders o ON o.id = r.order_id
           JOIN tickets t ON t.id = r.ticket_id
           JOIN users u ON u.id = r.requested_by
           ORDER BY r.created_at DESC`
        : `SELECT r.*, o.order_number, t.ticket_number
           FROM refunds r
           JOIN orders o ON o.id = r.order_id
           JOIN tickets t ON t.id = r.ticket_id
           WHERE r.requested_by = $1
           ORDER BY r.created_at DESC`;
    const params = req.user.role === 'staff' ? [] : [req.user.id];
    const result = await query(sql, params);
    return res.json({ refunds: result.rows });
  } catch (err) {
    return next(err);
  }
});

router.post('/', validateBody(createRefundSchema), async (req, res, next) => {
  try {
    const { order_id, ticket_id, amount, reason, idempotency_key } = req.validatedBody;
    const result = await processRefund({
      orderIdentifier: order_id,
      ticketId: ticket_id,
      amount,
      reason,
      idempotencyKey: idempotency_key,
      actorUser: req.user,
    });
    const statusCode = result.deduplicated ? 200 : 201;
    return res.status(statusCode).json({
      refund: result.refund,
      deduplicated: result.deduplicated,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
