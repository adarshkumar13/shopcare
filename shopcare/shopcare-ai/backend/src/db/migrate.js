const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');
const logger = require('../config/logger');

async function runMigrations() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  logger.info('Database schema migration completed');
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { runMigrations };
