const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { runMigrations } = require('./db/migrate');
const { exportOpenApiJson } = require('./config/swagger');

async function start() {
  try {
    await runMigrations();
    if (env.nodeEnv === 'development') {
      exportOpenApiJson();
    }
    app.listen(env.port, () => {
      logger.info({ port: env.port }, 'Support & Refund API server listening');
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start server');
    process.exit(1);
  }
}

start();
