// ---- Feedback API ----
// Lightweight feedback endpoint - logs to Cloud Run logs (no DB)

import express from 'express';
import { z } from 'zod';

const router = express.Router();

// Validation schema
const feedbackSchema = z.object({
  message: z.string().min(3).max(2000),
  page: z.string().max(200).optional(),
  meta: z.record(z.any()).optional(),
  ts: z.number().optional()
});

/**
 * POST /api/feedback
 * Log user feedback to structured logs
 */
router.post('/api/feedback', async (req, res) => {
  const result = feedbackSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      ok: false,
      code: 'invalid_request',
      details: result.error.flatten()
    });
  }

  const data = result.data;
  const rid = req.id || req.headers['x-request-id'];

  // Log feedback with structured data
  req.log.info({
    event: 'feedback',
    request_id: rid,
    user_id: req.user_id || undefined,
    tenant_id: req.headers['x-tenant-id'] || undefined,
    page: data.page,
    msg_len: data.message.length,
    meta: data.meta
  }, data.message);

  return res.json({ ok: true });
});

export default router;
