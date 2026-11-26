const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.nodeEnv === 'test' ? 'silent' : process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'password',
      'password_hash',
      'token',
      'jwt',
      'llmApiKey',
      'email',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'ecommerce-support-api',
    env: env.nodeEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
