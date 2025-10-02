// ---- JWT Authentication Utilities ----
// Simple JWT-based auth for dev/home use

import jwt from 'jsonwebtoken';

// Secret key for JWT (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'roamwise-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d'; // 7 days

/**
 * Sign a JWT token for a user
 */
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 * Returns payload if valid, null if invalid/expired
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.error('[Auth] Token verification failed:', err.message);
    return null;
  }
}

/**
 * Set auth cookie in response
 */
export function setAuthCookie(res, token) {
  res.cookie('roamwise_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
  });
}

/**
 * Clear auth cookie
 */
export function clearAuthCookie(res) {
  res.clearCookie('roamwise_auth');
}

/**
 * Middleware: Require authentication
 * Attaches user info to req.user if authenticated
 */
export function authRequired(req, res, next) {
  const token = req.cookies.roamwise_auth;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach user info to request
  req.user = payload;
  next();
}
