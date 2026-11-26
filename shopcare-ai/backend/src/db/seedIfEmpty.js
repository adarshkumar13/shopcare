const { pool } = require('./pool');
const { runMigrations } = require('./migrate');
const { seedDatabase } = require('./seed');
const logger = require('../config/logger');

async function seedIfEmpty() {
  await runMigrations();

  if (process.env.SEED_DEMO_DATA === 'false') {
    logger.info('Demo seeding is disabled');
    return;
  }

  const res = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (res.rows[0].count > 0) {
    logger.info('Database already has users, skipping demo seed');
    return;
  }

  await seedDatabase();
}

seedIfEmpty()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Seed check failed:', err);
    await pool.end();
    process.exit(1);
  });
