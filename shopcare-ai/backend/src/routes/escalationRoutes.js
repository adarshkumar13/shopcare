const express = require('express');
const { query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const sql =
      req.user.role === 'staff'
        ? `SELECT e.*, t.ticket_number, t.subject, t.status AS ticket_status,
                  u.name AS customer_name, o.order_number, o.total_amount AS order_total
           FROM escalations e
           JOIN tickets t ON t.id = e.ticket_id
           JOIN users u ON u.id = t.customer_id
           LEFT JOIN orders o ON o.id = t.order_id
           ORDER BY e.created_at DESC`
        : `SELECT e.id, e.ticket_id, e.summary, e.priority, e.decision, e.created_at, e.updated_at,
                  t.ticket_number, t.subject, t.status AS ticket_status,
                  o.order_number, o.total_amount AS order_total
           FROM escalations e
           JOIN tickets t ON t.id = e.ticket_id
           LEFT JOIN orders o ON o.id = t.order_id
           WHERE t.customer_id = $1
           ORDER BY e.created_at DESC`;

    const params = req.user.role === 'staff' ? [] : [req.user.id];
    const result = await query(sql, params);
    return res.json({ escalations: result.rows });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
