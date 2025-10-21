// ---- RoamWise Backend Server ----
// Lightweight multi-tenant auth + user profiles

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { nanoid } from 'nanoid';
import { migrate } from './db.js';
import { migrate as familyMigrate } from './src/ops/db-migrate.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import routeRoutes from './routes/route.js';
import hazardsRoutes from './routes/hazards.js';
import adminRoutes from './routes/admin.js';
import feedbackRoutes from './routes/feedback.js';
import familyAuth from './src/routes/family-auth.js';
import placesRoutes from './routes/places.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Logger
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

function reqId(req) {
  return req.headers['x-request-id'] || `rw_${nanoid(12)}`;
}

// ---- Middleware ----

// CORS - allow frontend on different port (dev mode)
app.use(cors({
  origin: ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:5173'],
  credentials: true // Allow cookies
}));

// Parse JSON bodies
app.use(express.json());

// Parse cookies
app.use(cookieParser());

// Structured logging
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = reqId(req);
    res.setHeader('x-request-id', id);
    return id;
  },
  customProps: (req, res) => ({
    route: req.path,
    user_id: req.user_id || undefined,
    tenant_id: req.headers['x-tenant-id'] || undefined,
  })
}));

// ---- Routes ----

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (dev login/logout)
app.use('/api/dev', authRoutes);

// Profile routes (requires auth)
app.use('/api/profile', profileRoutes);

// Route routes (OSRM integration)
app.use('/api/route', routeRoutes);

// Hazards routes (weather + traffic)
app.use(hazardsRoutes);

// Admin routes (health dashboard)
app.use(adminRoutes);

// Feedback routes
app.use(feedbackRoutes);

// Family auth routes (phone-only signin)
app.use('/api/family', familyAuth);

// Places routes (Google Places API)
app.use(placesRoutes);

// Note: /api/me endpoint is handled by family-auth router at /api/family/me

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  const log = req.log || logger;
  log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// ---- Startup ----

// Run database migrations
try {
  migrate();
  familyMigrate();
} catch (error) {
  logger.error({ err: error }, 'Migration failed');
  process.exit(1);
}

// Start server
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'RoamWise Backend started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, closing server gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
