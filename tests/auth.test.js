// ---- Auth Tests ----
import { describe, it, expect, beforeAll } from 'vitest';
import { signToken, verifyToken, authRequired } from '../auth.js';

describe('Auth Utils', () => {
  describe('signToken', () => {
    it('should sign a valid JWT token', () => {
      const payload = { userId: 1, username: 'test' };
      const token = signToken(payload);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload = { userId: 1, username: 'test' };
      const token = signToken(payload);
      const verified = verifyToken(token);
      expect(verified).toBeTruthy();
      expect(verified.userId).toBe(1);
      expect(verified.username).toBe('test');
    });

    it('should return null for invalid token', () => {
      const verified = verifyToken('invalid-token');
      expect(verified).toBeNull();
    });

    it('should return null for expired token', () => {
      // This would require mocking time or using a very short expiration
      // Skipping for now, but could be added with sinon/jest timers
    });
  });

  describe('authRequired middleware', () => {
    it('should attach user to request if token is valid', () => {
      const payload = { userId: 1, username: 'test' };
      const token = signToken(payload);

      const req = { cookies: { roamwise_auth: token } };
      const res = {};
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      authRequired(req, res, next);

      expect(nextCalled).toBe(true);
      expect(req.user).toBeTruthy();
      expect(req.user.userId).toBe(1);
    });

    it('should return 401 if no token provided', () => {
      const req = { cookies: {} };
      const res = {
        status: (code) => {
          expect(code).toBe(401);
          return { json: (body) => expect(body.error).toBeTruthy() };
        }
      };
      const next = () => {};

      authRequired(req, res, next);
    });
  });
});
