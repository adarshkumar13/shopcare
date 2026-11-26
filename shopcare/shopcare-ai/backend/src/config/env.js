const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret =
  process.env.JWT_SECRET || 'dev-only-jwt-secret-change-in-production-32chars';

const weakSecret =
  jwtSecret.length < 32 || /replace_with|change_this|dev-only|your_/i.test(jwtSecret);
if (nodeEnv === 'production' && weakSecret) {
  throw new Error('JWT_SECRET must be a random string of at least 32 characters in production');
}

const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv,
  trustProxy: parseInt(process.env.TRUST_PROXY || '0', 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/ecommerce_support',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  llmApiKey: (process.env.LLM_API_KEY || '').trim(),
  llmBaseUrl: (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
  llmModel: process.env.LLM_MODEL || 'gpt-4o-mini',
  autoRefundMaxInr: Number(process.env.AUTO_REFUND_MAX_INR || 5000),
};

module.exports = env;
