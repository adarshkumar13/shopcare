const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getOrderDetails, listCustomerOrders } = require('../services/orderService');
const { query } = require('../db/pool');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    if (req.user.role === 'staff') {
      const result = await query(
        `SELECT o.*, u.name AS customer_name, u.email AS customer_email
         FROM orders o
         JOIN users u ON u.id = o.customer_id
         ORDER BY o.created_at DESC`
      );
      return res.json({ orders: result.rows });
    }
    const orders = await listCustomerOrders(req.user.id);
    return res.json({ orders });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const order = await getOrderDetails({
      orderIdentifier: req.params.id,
      customerId: req.user.id,
      role: req.user.role,
    });
    return res.json({ order });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
