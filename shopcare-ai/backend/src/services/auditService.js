const { pool } = require('../db/pool');

async function recordAudit(clientOrPool, { entityType, entityId, action, actorId = null, details = {} }) {
  const executor = clientOrPool || pool;
  const result = await executor.query(
    `INSERT INTO audit_logs (entity_type, entity_id, action, actor_id, details)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [entityType, entityId, action, actorId, JSON.stringify(details)]
  );
  return result.rows[0];
}

module.exports = {
  recordAudit,
};
