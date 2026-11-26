const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { query } = require('../db/pool');
const env = require('../config/env');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255).toLowerCase(),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn,
  });
}

router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.validatedBody;
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new AppError(409, 'An account with this email already exists', 'EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'customer')
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash]
    );

    const user = result.rows[0];
    const token = signToken(user);
    return res.status(201).json({ user, token });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validatedBody;
    const result = await query(
      'SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const row = result.rows[0];
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const user = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      created_at: row.created_at,
    };
    const token = signToken(user);
    return res.json({ user, token });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
