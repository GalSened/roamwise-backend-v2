// backend/src/routes/family-auth.js
import express from 'express';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import db from '../../db.js';
import { toE164, maskPhone } from '../ops/phone.js';

// Session secret for JWT signing (use environment variable in production)
const SESSION_SECRET = process.env.SESSION_SECRET || 'roamwise-family-session-secret-change-in-production';

const router = express.Router();

// Rate limit: 5 req/min per IP (simple in-memory)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 min
const RATE_LIMIT_MAX = 5;

function rateCheck(ip) {
  const now = Date.now();
  const key = `family-auth:${ip}`;
  const rec = rateLimitMap.get(key) || { count: 0, reset: now + RATE_LIMIT_WINDOW };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + RATE_LIMIT_WINDOW;
  }
  rec.count++;
  rateLimitMap.set(key, rec);
  return rec.count <= RATE_LIMIT_MAX;
}

// POST /api/family/signin/start - check if phone is known
router.post('/signin/start', (req, res) => {
  const ip = req.ip;
  if (!rateCheck(ip)) {
    return res.status(429).json({ ok: false, code: 'rate_limited' });
  }

  const { phone } = req.body || {};
  const e164 = toE164(phone);
  if (!e164) {
    return res.status(400).json({ ok: false, code: 'invalid_phone' });
  }

  const row = db.prepare('SELECT user_id, name FROM family_users WHERE phone_e164 = ?').get(e164);
  const known = !!row;

  req.log.info({ event: 'family_auth_start', phone_masked: maskPhone(e164), known }, 'Family signin started');

  res.json({ ok: true, known, name: row?.name || null });
});

// POST /api/family/signin/finish - create or update user
router.post('/signin/finish', (req, res) => {
  const ip = req.ip;
  if (!rateCheck(ip)) {
    return res.status(429).json({ ok: false, code: 'rate_limited' });
  }

  const { phone, name } = req.body || {};
  const e164 = toE164(phone);
  if (!e164) {
    return res.status(400).json({ ok: false, code: 'invalid_phone' });
  }
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ ok: false, code: 'name_required' });
  }

  const trimmedName = name.trim().slice(0, 100);

  // Check if user exists
  let row = db.prepare('SELECT user_id FROM family_users WHERE phone_e164 = ?').get(e164);
  let userId;

  if (!row) {
    // New user
    userId = nanoid(12);
    db.prepare('INSERT INTO family_users (phone_e164, name, user_id) VALUES (?, ?, ?)').run(e164, trimmedName, userId);
    req.log.info({ event: 'family_user_created', user_id: userId, phone_masked: maskPhone(e164) }, 'New family user created');
  } else {
    // Existing user - update name and timestamp
    userId = row.user_id;
    db.prepare('UPDATE family_users SET name = ?, updated_at = unixepoch() WHERE phone_e164 = ?').run(trimmedName, e164);
    req.log.info({ event: 'family_user_updated', user_id: userId, phone_masked: maskPhone(e164) }, 'Family user updated');
  }

  // Set session cookie (Signed JWT token)
  const sessionData = { userId, name: trimmedName, phone: maskPhone(e164) };
  const token = jwt.sign(sessionData, SESSION_SECRET, { expiresIn: '365d' });

  res.cookie('family_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'Lax',
    maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
  });

  res.json({ ok: true, user_id: userId });
});

// GET /api/family/me - get current session
router.get('/me', (req, res) => {
  const token = req.cookies?.family_session;
  if (!token) {
    return res.status(401).json({ ok: false, code: 'not_signed_in' });
  }

  try {
    const session = jwt.verify(token, SESSION_SECRET);
    res.json({ ok: true, session });
  } catch (error) {
    req.log.warn({ err: error }, 'Invalid family session token');
    res.status(401).json({ ok: false, code: 'invalid_session' });
  }
});

export default router;
