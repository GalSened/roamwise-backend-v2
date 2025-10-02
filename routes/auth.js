// ---- Auth Routes ----
// Dev login/logout endpoints (no password, choose tenant+user)

import express from 'express';
import { z } from 'zod';
import { getUserByCredentials, getAllTenants, getUsersByTenant } from '../db.js';
import { signToken, setAuthCookie, clearAuthCookie } from '../auth.js';

const router = express.Router();

// Validation schema for login
const loginSchema = z.object({
  tenant: z.string().min(1, 'Tenant is required'),
  username: z.string().min(1, 'Username is required')
});

/**
 * POST /api/dev/login
 * Dev login - choose tenant and username (no password)
 */
router.post('/login', (req, res) => {
  try {
    // Validate request body
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: result.error.errors
      });
    }

    const { tenant, username } = result.data;

    // Find user by tenant and username
    const user = getUserByCredentials(tenant, username);

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: `No user "${username}" found in tenant "${tenant}"`
      });
    }

    // Create JWT payload
    const payload = {
      userId: user.id,
      username: user.username,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      displayName: user.display_name
    };

    // Sign token and set cookie
    const token = signToken(payload);
    setAuthCookie(res, token);

    console.log('[Auth] User logged in:', user.username, 'tenant:', user.tenant_name);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        tenant: user.tenant_name
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/dev/logout
 * Clear auth cookie
 */
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  console.log('[Auth] User logged out');
  res.json({ success: true });
});

/**
 * GET /api/dev/tenants
 * Get all available tenants for login dropdown
 */
router.get('/tenants', (req, res) => {
  try {
    const tenants = getAllTenants();
    res.json({ tenants });
  } catch (error) {
    console.error('[Auth] Get tenants error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/dev/users/:tenantId
 * Get all users for a tenant (for login dropdown)
 */
router.get('/users/:tenantId', (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId, 10);
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    const users = getUsersByTenant(tenantId);
    res.json({ users });
  } catch (error) {
    console.error('[Auth] Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
