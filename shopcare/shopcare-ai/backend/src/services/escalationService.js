const { withTransaction } = require('../db/pool');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('./auditService');

async function executeEscalationInTx(
  client,
  { ticketId, summary, priority = 'high', actorId = null, orderId = null }
) {
  const ticketRes = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [
    ticketId,
  ]);
  if (ticketRes.rows.length === 0) {
    throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  }

  const existing = await client.query(
    `SELECT * FROM escalations WHERE ticket_id = $1 AND decision = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [ticketId]
  );

  let escalation;
  let created = false;

  if (existing.rows.length > 0) {
    const upd = await client.query(
      `UPDATE escalations
       SET summary = $1, priority = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [summary, priority, existing.rows[0].id]
    );
    escalation = upd.rows[0];
  } else {
    const ins = await client.query(
      `INSERT INTO escalations (ticket_id, summary, priority, decision)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [ticketId, summary, priority]
    );
    escalation = ins.rows[0];
    created = true;
  }

  await client.query(
    `UPDATE tickets
     SET status = 'escalated',
         priority = $1,
         order_id = COALESCE(order_id, $3::uuid),
         updated_at = NOW()
     WHERE id = $2`,
    [priority, ticketId, orderId]
  );

  await recordAudit(client, {
    entityType: 'escalation',
    entityId: escalation.id,
    action: created ? 'escalation.created' : 'escalation.updated',
    actorId,
    details: {
      ticket_id: ticketId,
      priority,
      summary,
    },
  });

  return { escalation, created };
}

async function escalateToHuman(params) {
  if (params.dbClient) {
    return executeEscalationInTx(params.dbClient, params);
  }
  return withTransaction((client) => executeEscalationInTx(client, params));
}

module.exports = {
  escalateToHuman,
};
