const { withTransaction } = require('../db/pool');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('./auditService');
const { UUID_REGEX } = require('./orderService');
const env = require('../config/env');

async function executeRefundInTx(
  client,
  { orderIdentifier, ticketId, amount, reason, idempotencyKey, actorUser }
) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new AppError(400, 'Idempotency key is required', 'MISSING_IDEMPOTENCY_KEY');
  }

  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [idempotencyKey]);

  // 1. Idempotency check
  const idemRes = await client.query('SELECT * FROM refunds WHERE idempotency_key = $1', [
    idempotencyKey,
  ]);
  if (idemRes.rows.length > 0) {
    return { refund: idemRes.rows[0], deduplicated: true };
  }

  // 2. Load and lock order
  const trimmed = String(orderIdentifier || '').trim();
  if (!trimmed) {
    throw new AppError(400, 'Order identifier is required', 'MISSING_ORDER_ID');
  }

  const orderSql = UUID_REGEX.test(trimmed)
    ? 'SELECT * FROM orders WHERE id = $1 FOR UPDATE'
    : 'SELECT * FROM orders WHERE UPPER(order_number) = UPPER($1) FOR UPDATE';
  const orderRes = await client.query(orderSql, [trimmed]);

  if (orderRes.rows.length === 0) {
    throw new AppError(404, 'Order not found or inaccessible', 'ORDER_NOT_FOUND');
  }
  const order = orderRes.rows[0];

  if (actorUser.role !== 'staff' && order.customer_id !== actorUser.id) {
    throw new AppError(404, 'Order not found or inaccessible', 'ORDER_NOT_FOUND');
  }

  // 3. Verify ticket ownership
  const ticketRes = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [
    ticketId,
  ]);
  if (ticketRes.rows.length === 0) {
    throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  }
  const ticket = ticketRes.rows[0];
  if (actorUser.role !== 'staff' && ticket.customer_id !== actorUser.id) {
    throw new AppError(403, 'Forbidden: cannot access another customer ticket', 'FORBIDDEN');
  }

  // 4. Verify order delivery status
  if (order.status !== 'delivered' || !order.delivery_date) {
    throw new AppError(
      400,
      `Order ${order.order_number} is currently '${order.status}' and has not been delivered yet. Post-delivery refunds are only available for delivered orders.`,
      'ORDER_NOT_DELIVERED'
    );
  }

  // 5. Verify return window
  const returnWindowDays = Number(order.item_details?.return_window_days ?? 15);
  const deliveredAt = new Date(order.delivery_date).getTime();
  const daysElapsed = Math.floor((Date.now() - deliveredAt) / (1000 * 60 * 60 * 24));
  if (daysElapsed > returnWindowDays) {
    throw new AppError(
      400,
      `Return window expired for ${order.order_number}. Delivered ${daysElapsed} days ago; policy allows ${returnWindowDays} days.`,
      'RETURN_WINDOW_EXPIRED'
    );
  }

  // 6. Validate refund amount
  const orderTotal = Number(order.total_amount);
  const requestedAmount =
    amount !== undefined && amount !== null ? Number(amount) : orderTotal;
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > orderTotal) {
    throw new AppError(
      400,
      `Refund amount must be greater than ₹0 and cannot exceed order total ₹${orderTotal.toFixed(2)}.`,
      'INVALID_REFUND_AMOUNT'
    );
  }

  // 7. Prevent duplicate active/approved refund for the same order
  const existingOrderRefund = await client.query(
    `SELECT * FROM refunds WHERE order_id = $1 AND status IN ('pending', 'approved') ORDER BY created_at DESC LIMIT 1`,
    [order.id]
  );
  if (existingOrderRefund.rows.length > 0) {
    throw new AppError(
      409,
      `A refund (${existingOrderRefund.rows[0].status}) already exists for order ${order.order_number}.`,
      'DUPLICATE_REFUND'
    );
  }

  // 8. Enforce ₹5,000 threshold for non-staff requests
  if (actorUser.role !== 'staff' && requestedAmount > env.autoRefundMaxInr) {
    throw new AppError(
      403,
      `Refund of ₹${requestedAmount.toFixed(2)} exceeds the ₹${env.autoRefundMaxInr} auto-approval limit and requires human staff escalation.`,
      'REQUIRES_ESCALATION'
    );
  }

  // 9. Create refund record
  const insertRes = await client.query(
    `INSERT INTO refunds (order_id, ticket_id, amount, reason, status, idempotency_key, requested_by, reviewed_by)
     VALUES ($1, $2, $3, $4, 'approved', $5, $6, $7)
     RETURNING *`,
    [
      order.id,
      ticket.id,
      requestedAmount.toFixed(2),
      reason || 'Customer refund request verified against policy',
      idempotencyKey,
      ticket.customer_id,
      actorUser.role === 'staff' ? actorUser.id : null,
    ]
  );
  const refund = insertRes.rows[0];

  // Link order to ticket if missing and update status
  await client.query(
    `UPDATE tickets
     SET order_id = COALESCE(order_id, $1),
         status = CASE WHEN status IN ('open', 'in_progress') THEN 'resolved' ELSE status END,
         updated_at = NOW()
     WHERE id = $2`,
    [order.id, ticket.id]
  );

  await recordAudit(client, {
    entityType: 'refund',
    entityId: refund.id,
    action: actorUser.role === 'staff' ? 'refund.staff_approved' : 'refund.auto_approved',
    actorId: actorUser.id,
    details: {
      order_id: order.id,
      order_number: order.order_number,
      ticket_id: ticket.id,
      amount: Number(refund.amount),
      idempotency_key: idempotencyKey,
    },
  });

  return { refund, deduplicated: false, order };
}

async function processRefund(params) {
  if (params.dbClient) {
    return executeRefundInTx(params.dbClient, params);
  }
  return withTransaction((client) => executeRefundInTx(client, params));
}

module.exports = {
  processRefund,
};
