const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../db/pool');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    const result = await query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [decoded.sub]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    req.user = result.rows[0];
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
