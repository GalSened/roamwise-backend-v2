// ---- Profile Routes ----
// GET/PUT user profile with travel preferences

import express from 'express';
import { z } from 'zod';
import { getProfileByUserId, updateProfile } from '../db.js';
import { authRequired } from '../auth.js';
import { observe } from '../ops/metrics.js';

const router = express.Router();

// Validation schema for profile update
const updateProfileSchema = z.object({
  pace: z.enum(['slow', 'relaxed', 'active', 'packed']).optional(),
  likes: z.array(z.string()).optional(),
  avoid: z.array(z.string()).optional(),
  dietary: z.array(z.string()).optional(),
  budget_min: z.number().int().min(0).optional(),
  budget_max: z.number().int().min(0).optional()
}).refine(
  (data) => !data.budget_min || !data.budget_max || data.budget_min <= data.budget_max,
  { message: 'budget_min must be less than or equal to budget_max' }
);

/**
 * GET /api/profile
 * Get current user's profile and preferences
 * Requires authentication
 */
router.get('/', authRequired, (req, res) => {
  try {
    const userId = req.user.userId;

    const profile = getProfileByUserId(userId);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Log event
    req.log.info({ event: 'profile_get', user_id: userId }, 'Profile retrieved');

    // Record metrics
    observe('profile_get', 1, true);

    // Return profile with user info
    res.json({
      user: {
        id: profile.user_id,
        username: profile.username,
        displayName: profile.display_name,
        tenant: profile.tenant_name
      },
      preferences: {
        pace: profile.pace,
        likes: profile.likes,
        avoid: profile.avoid,
        dietary: profile.dietary,
        budget: {
          min: profile.budget_min,
          max: profile.budget_max
        }
      },
      updatedAt: profile.updated_at
    });
  } catch (error) {
    req.log.error({ err: error }, 'Get profile error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/profile
 * Update current user's preferences
 * Requires authentication
 */
router.put('/', authRequired, (req, res) => {
  try {
    // Validate request body
    const result = updateProfileSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: result.error.errors
      });
    }

    const userId = req.user.userId;
    const prefs = result.data;

    // Update profile
    const updated = updateProfile(userId, prefs);

    if (!updated) {
      return res.status(404).json({ error: 'Profile not found or no changes made' });
    }

    // Get updated profile
    const profile = getProfileByUserId(userId);

    // Log event
    req.log.info({ event: 'profile_put', user_id: userId }, 'Profile updated');

    // Record metrics
    observe('profile_put', 1, true);

    res.json({
      success: true,
      preferences: {
        pace: profile.pace,
        likes: profile.likes,
        avoid: profile.avoid,
        dietary: profile.dietary,
        budget: {
          min: profile.budget_min,
          max: profile.budget_max
        }
      },
      updatedAt: profile.updated_at
    });
  } catch (error) {
    req.log.error({ err: error }, 'Update profile error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
