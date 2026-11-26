const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const logger = require('./config/logger');
const { pool } = require('./db/pool');
const { openApiSpec } = require('./config/swagger');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const refundRoutes = require('./routes/refundRoutes');
const escalationRoutes = require('./routes/escalationRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

if (env.trustProxy > 0) {
  app.set('trust proxy', env.trustProxy);
}

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

if (env.nodeEnv !== 'test') {
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  message: { error: 'Too many attempts, please try again later', code: 'RATE_LIMITED' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path }, 'Incoming HTTP request');
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok', database: 'connected', ai_provider: env.llmApiKey ? 'llm' : 'mock' });
  } catch (err) {
    return res.status(503).json({ status: 'degraded', database: 'disconnected' });
  }
});

app.get('/api-docs.json', (_req, res) => res.json(openApiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/escalations', escalationRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use(errorHandler);

module.exports = app;
