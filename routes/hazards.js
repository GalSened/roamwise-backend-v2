// ---- Hazards API ----
// Weather alerts + traffic incidents with caching and circuit breaker

import express from 'express';
import { LRUCache } from 'lru-cache';
import { time } from '../util/timing.js';
import { observe } from '../ops/metrics.js';

const router = express.Router();

// Configuration
const WEATHER_URL = process.env.HAZ_WEATHER_URL || '';
const TRAFFIC_URL = process.env.HAZ_TRAFFIC_URL || '';
const TTL_MS = Number(process.env.HAZ_CACHE_TTL_MS || 10 * 60 * 1000); // 10 min
const TIMEOUT_MS = Number(process.env.HAZ_TIMEOUT_MS || 12000);

// Cache and circuit breaker
const cache = new LRUCache({ max: 500, ttl: TTL_MS });
let breakerUntil = 0;

/**
 * Calculate distance between two points (Haversine formula)
 */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Get center point of a geometry
 */
function getCenterPoint(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') {
    return [geometry.coordinates[1], geometry.coordinates[0]]; // [lat, lon]
  }
  if (geometry.type === 'LineString' && geometry.coordinates.length > 0) {
    const mid = geometry.coordinates[Math.floor(geometry.coordinates.length / 2)];
    return [mid[1], mid[0]];
  }
  if (geometry.type === 'Polygon' && geometry.coordinates[0]?.length > 0) {
    const ring = geometry.coordinates[0];
    const mid = ring[Math.floor(ring.length / 2)];
    return [mid[1], mid[0]];
  }
  return null;
}

/**
 * Check if feature is within radius
 */
function isWithinRadius(lat, lon, feature, radiusMeters) {
  const center = getCenterPoint(feature.geometry);
  if (!center) return false;
  return distanceMeters(lat, lon, center[0], center[1]) <= radiusMeters;
}

/**
 * Fetch JSON with timeout
 */
async function fetchJson(url, timeoutMs) {
  if (!url) return null;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(tid);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    clearTimeout(tid);
    return null;
  }
}

/**
 * Normalize weather feed to standard format
 */
function normalizeWeather(fc) {
  const out = { type: 'FeatureCollection', features: [] };
  if (!fc?.features) return out;

  for (const f of fc.features) {
    const sevStr = String(
      f.properties?.severity || f.properties?.SEVERITY || ''
    ).toLowerCase();

    let severity = 'minor';
    if (sevStr.includes('severe')) severity = 'severe';
    else if (sevStr.includes('moderate')) severity = 'moderate';

    out.features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        kind: 'weather',
        severity,
        title: f.properties?.headline || f.properties?.event || 'Weather Alert',
      },
    });
  }
  return out;
}

/**
 * Normalize traffic feed to standard format
 */
function normalizeTraffic(fc) {
  const out = { type: 'FeatureCollection', features: [] };
  if (!fc?.features) return out;

  for (const f of fc.features) {
    out.features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        kind: 'traffic',
        severity: f.properties?.severity || 'moderate',
        title: f.properties?.title || 'Traffic Incident',
      },
    });
  }
  return out;
}

/**
 * GET /api/hazards
 * Get weather alerts and traffic incidents within radius
 */
router.get('/api/hazards', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radius = Number(req.query.radius || 10000);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({
        ok: false,
        code: 'invalid_request',
        message: 'lat and lon are required',
      });
    }

    // Check cache
    const key = `haz:${lat.toFixed(3)}:${lon.toFixed(3)}:${radius}`;
    const hit = cache.get(key);
    if (hit) {
      req.log.debug({ key }, 'Cache hit');
      return res.json(hit);
    }

    // Circuit breaker check
    const now = Date.now();
    if (now < breakerUntil) {
      req.log.warn('Circuit breaker open');
      return res.status(503).json({
        ok: false,
        code: 'provider_unavailable',
        message: 'Hazards provider temporarily unavailable',
      });
    }

    // Fetch from providers (or return empty if URLs not configured)
    const { val: [weatherRaw, trafficRaw], ms } = await time('hazards_fetch', async () => {
      return Promise.all([
        fetchJson(WEATHER_URL, TIMEOUT_MS),
        fetchJson(TRAFFIC_URL, TIMEOUT_MS),
      ]);
    });

    const weather = normalizeWeather(weatherRaw);
    const traffic = normalizeTraffic(trafficRaw);

    // Filter by radius
    const weatherIn = weather.features.filter((f) =>
      isWithinRadius(lat, lon, f, radius)
    );
    const trafficIn = traffic.features.filter((f) =>
      isWithinRadius(lat, lon, f, radius)
    );

    // Check for severe hazards
    const severe =
      weatherIn.some((f) => f.properties?.severity === 'severe') ||
      trafficIn.some((f) =>
        String(f.properties?.severity).toLowerCase().includes('severe')
      );

    const payload = {
      ok: true,
      severe,
      counts: {
        weather: weatherIn.length,
        traffic: trafficIn.length,
      },
      weather: {
        type: 'FeatureCollection',
        features: weatherIn,
      },
      traffic: {
        type: 'FeatureCollection',
        features: trafficIn,
      },
    };

    // Cache successful response
    cache.set(key, payload);

    // Log successful hazards event
    req.log.info({
      event: 'hazards_ok',
      ms,
      weather_count: payload.counts.weather,
      traffic_count: payload.counts.traffic,
      severe: payload.severe
    }, 'Hazards fetched successfully');

    // Record metrics
    observe('hazards', ms, true);

    return res.json(payload);
  } catch (error) {
    req.log.error({ err: error }, 'Unexpected error');
    breakerUntil = Date.now() + 30_000;
    observe('hazards', 0, false);
    return res.status(502).json({
      ok: false,
      code: 'provider_failed',
      message: error.message,
    });
  }
});

export default router;
