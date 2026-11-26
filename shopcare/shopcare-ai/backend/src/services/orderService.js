const { query } = require('../db/pool');
const { AppError } = require('../middleware/errorHandler');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getOrderDetails({ orderIdentifier, customerId, role = 'customer', dbClient = null }) {
  if (!orderIdentifier || typeof orderIdentifier !== 'string') {
    throw new AppError(400, 'Order identifier is required', 'MISSING_ORDER_ID');
  }

  const trimmed = orderIdentifier.trim();
  const executor = dbClient || { query };

  const isUuid = UUID_REGEX.test(trimmed);
  const sql = isUuid
    ? 'SELECT * FROM orders WHERE id = $1'
    : 'SELECT * FROM orders WHERE UPPER(order_number) = UPPER($1)';

  const res = await executor.query(sql, [trimmed]);
  if (res.rows.length === 0) {
    throw new AppError(404, 'Order not found or inaccessible', 'ORDER_NOT_FOUND');
  }

  const order = res.rows[0];
  if (role !== 'staff' && order.customer_id !== customerId) {
    throw new AppError(404, 'Order not found or inaccessible', 'ORDER_NOT_FOUND');
  }

  return order;
}

async function listCustomerOrders(customerId) {
  const res = await query(
    `SELECT o.*,
            COALESCE(
              (SELECT json_agg(json_build_object(
                'id', r.id,
                'amount', r.amount,
                'status', r.status,
                'reason', r.reason,
                'created_at', r.created_at
              ) ORDER BY r.created_at DESC)
              FROM refunds r WHERE r.order_id = o.id),
              '[]'::json
            ) AS refunds
     FROM orders o
     WHERE o.customer_id = $1
     ORDER BY o.created_at DESC`,
    [customerId]
  );
  return res.rows;
}

module.exports = {
  getOrderDetails,
  listCustomerOrders,
  UUID_REGEX,
};
