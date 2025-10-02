// ---- Route API ----
// Real routing via OSRM with cache, timeout, circuit breaker

import express from 'express';
import { z } from 'zod';
import { LRUCache } from 'lru-cache';
import { time } from '../util/timing.js';
import { observe } from '../ops/metrics.js';
import { incrRelaxed, incrProvider } from '../ops/counters.js';
import { googleComputeRouteMatrix } from '../src/providers/google-matrix.js';
import { getMatrixCache, setMatrixCache } from '../src/ops/cache-matrix.js';

const router = express.Router();

// Map user-friendly avoid terms to OSRM exclude classes
const AVOID_MAP = {
  tolls: 'toll',
  ferries: 'ferry',
  highways: 'motorway'
};

// Map user-friendly avoid terms to ORS avoid features
const ORS_AVOID_MAP = {
  tolls: 'tollways',
  ferries: 'ferries',
  highways: 'highways'
};

// Test hooks for retry logic
const TEST_HOOKS = process.env.ROUTE_TEST_HOOKS === '1';

// Configuration from environment variables
const OSRM_URL = process.env.OSRM_URL || 'http://localhost:5000';
const ORS_URL = process.env.ORS_URL || 'https://api.openrouteservice.org';
const ORS_API_KEY = process.env.ORS_API_KEY || '';
const TIMEOUT_MS = Number(process.env.ROUTE_TIMEOUT_MS || 12000);
const CACHE_MAX = Number(process.env.ROUTE_CACHE_MAX || 1000);
const CACHE_TTL_MS = Number(process.env.ROUTE_CACHE_TTL_MS || 5 * 60 * 1000); // 5 min

// Circuit breaker state
let breakerUntil = 0;

// LRU cache for route responses
const cache = new LRUCache({
  max: CACHE_MAX,
  ttl: CACHE_TTL_MS,
});

// Validation schema
const routeSchema = z.object({
  stops: z.array(z.object({
    lat: z.number().gte(-90).lte(90),
    lon: z.number().gte(-180).lte(180),
  })).min(2).max(5),
  mode: z.enum(['drive']).default('drive'),
  constraints: z.record(z.any()).optional()
});

/**
 * Call OSRM with timeout and error handling
 * @param {string} url - OSRM URL to fetch
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{ok: boolean, json?: object, status?: number, error?: string, body?: string}>}
 */
async function callOsrm(url, timeoutMs) {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(tid);

    if (!r.ok) {
      const body = await r.text();
      return { ok: false, status: r.status, body };
    }

    const json = await r.json();
    return { ok: true, json };
  } catch (e) {
    clearTimeout(tid);
    const error = e?.name === 'AbortError' ? 'timeout' : String(e);
    return { ok: false, error };
  }
}

/**
 * Call OpenRouteService with timeout and error handling
 * @param {Array} stops - Array of {lat, lon} objects
 * @param {Array} avoidArr - Array of user-friendly avoid terms
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{ok: boolean, payload?: object, status?: number, error?: string}>}
 */
async function callORS(stops, avoidArr, timeoutMs) {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);

  // Build avoid_features array from user preferences
  const avoidFeatures = avoidArr
    .map(term => ORS_AVOID_MAP[term])
    .filter(Boolean)
    .filter((val, idx, arr) => arr.indexOf(val) === idx); // Dedupe

  const body = {
    coordinates: stops.map(p => [p.lon, p.lat]),
    instructions: false,
    geometry: true,
    elevation: false,
    ...(avoidFeatures.length > 0 && {
      options: { avoid_features: avoidFeatures }
    })
  };

  try {
    const r = await fetch(`${ORS_URL}/v2/directions/driving-car/geojson`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': ORS_API_KEY
      },
      body: JSON.stringify(body),
      signal: ac.signal
    });

    clearTimeout(tid);

    if (!r.ok) {
      const text = await r.text();
      return { ok: false, status: r.status, body: text };
    }

    const geo = await r.json();

    // Normalize to our payload format
    const feat = geo.features?.[0];
    if (!feat || !feat.geometry) {
      return { ok: false, error: 'no_route' };
    }

    const distance_m = Math.round(feat.properties?.summary?.distance ?? 0);
    const duration_s = Math.round(feat.properties?.summary?.duration ?? 0);

    return {
      ok: true,
      payload: {
        ok: true,
        distance_m,
        duration_s,
        geometry: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: feat.geometry
          }]
        },
        route_retry_relaxed: false // ORS honors avoid preferences
      }
    };
  } catch (e) {
    clearTimeout(tid);
    const error = e?.name === 'AbortError' ? 'timeout' : String(e);
    return { ok: false, error };
  }
}

/**
 * Generate cache key from stops and avoid preferences (rounded to reduce churn)
 */
function keyFor(stops, exclude) {
  const s = stops
    .map(p => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`)
    .join('->');
  const suffix = exclude ? `:ex=${exclude}` : '';
  return `r:${s}${suffix}`;
}

/**
 * Build OSRM exclude parameter from user avoid preferences
 * @param {string[]} avoid - Array of user-friendly terms (tolls, ferries, highways)
 * @returns {string} OSRM exclude classes (e.g. "toll,ferry")
 */
function buildExcludeParam(avoid) {
  if (!Array.isArray(avoid) || avoid.length === 0) {
    return '';
  }

  const classes = avoid
    .map(term => AVOID_MAP[term])
    .filter(Boolean) // Remove undefined mappings
    .filter((val, idx, arr) => arr.indexOf(val) === idx); // Dedupe

  return classes.join(',');
}

/**
 * Get travel matrix using Google Distance Matrix v2 API
 * Cache-first pattern with 60s TTL
 * @param {Array} points - Array of {lat, lon} objects
 * @param {Object} options - { mode, departureTimeIso }
 * @returns {Promise<{ok, n, matrix}>}
 */
export async function getTravelMatrix(points, { mode='DRIVE', departureTimeIso } = {}) {
  const c = getMatrixCache(mode, points, departureTimeIso);
  if (c.hit) return c.value;

  const res = await googleComputeRouteMatrix(points, { mode, departureTimeIso });
  if (!res.ok) throw new Error(res.error || res.status || res.body || 'matrix_failed');

  setMatrixCache(c.key, res);
  return res;
}

/**
 * POST /api/route
 * Compute route between stops using OSRM
 */
router.post('/', async (req, res) => {
  try {
    // Validate request body
    const result = routeSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        ok: false,
        code: 'invalid_request',
        details: result.error.flatten()
      });
    }

    const { stops, constraints } = result.data;
    const avoid = constraints?.avoid || [];
    const exclude = buildExcludeParam(avoid);

    const k = keyFor(stops, exclude);

    // Check cache first
    const hit = cache.get(k);
    if (hit) {
      req.log.debug({ route: k }, 'Cache hit');
      return res.json(hit);
    }

    // Circuit breaker: short-circuit if provider was failing recently
    const now = Date.now();
    if (now < breakerUntil) {
      req.log.warn('Circuit breaker open');
      return res.status(503).json({
        ok: false,
        code: 'provider_unavailable',
        message: 'Route provider temporarily unavailable'
      });
    }

    const startTime = Date.now();
    const wantsAvoid = avoid.length > 0;
    let provider = 'osrm';
    let payload = null;

    // Strategy: Use ORS if avoid is requested AND ORS is configured
    if (wantsAvoid && ORS_API_KEY) {
      provider = 'ors';
      const orsResult = await callORS(stops, avoid, TIMEOUT_MS);

      if (orsResult.ok && orsResult.payload) {
        // ORS succeeded - use it directly
        payload = orsResult.payload;
      } else {
        // ORS failed - fall back to OSRM
        req.log.warn({
          event: 'ors_fallback',
          detail: orsResult.error || orsResult.status || orsResult.body
        }, 'ORS failed, falling back to OSRM');
        provider = 'osrm_fallback';
      }
    }

    // If ORS wasn't used or failed, use OSRM with Step 29 retry logic
    if (!payload) {
      const [a, b] = [stops[0], stops[stops.length - 1]];
      const coords = `${a.lon},${a.lat};${b.lon},${b.lat}`;
      const baseUrl = `${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=false`;
      const excludeQS = exclude ? `&exclude=${exclude}` : '';
      const urlWith = `${baseUrl}${excludeQS}`;

      // First attempt: with exclude parameter if present
      let first = await callOsrm(urlWith, TIMEOUT_MS);

      // Optional test hook to force retry code path
      if (TEST_HOOKS && exclude && req.body?.constraints?._testForceRelax) {
        first = { ok: false, error: 'test_forced' };
      }

      // Retry logic: if first call fails OR OSRM returns non-Ok, try without exclude
      let relaxed = false;
      if (!first.ok || (first.ok && first.json?.code !== 'Ok')) {
        // Try once WITHOUT exclude (regardless of OSRM exclude support)
        const urlNo = baseUrl;
        const second = await callOsrm(urlNo, TIMEOUT_MS);

        if (second.ok && second.json?.code === 'Ok' && second.json?.routes?.length) {
          first = second;
          relaxed = !!exclude; // We tried to avoid, but had to relax
          if (provider === 'osrm_fallback') {
            provider = 'osrm_fallback_relaxed';
          } else {
            provider = 'osrm_relaxed';
          }
        }
      }

      const ms = Date.now() - startTime;

      // Check if we have a valid route
      if (!first.ok || first.json?.code !== 'Ok' || !first.json?.routes?.length) {
        // Set breaker based on error type
        if (first.status && first.status >= 500) {
          breakerUntil = Date.now() + 60_000; // 60s for 5xx errors
        } else if (first.error) {
          breakerUntil = Date.now() + 30_000; // 30s for network/timeout
        }

        req.log.error({
          event: 'route_err',
          provider,
          exclude,
          relaxed_attempt: !!exclude,
          detail: first.error || first.status || first.body || first.json?.message,
          ms
        }, 'Route failed');

        observe('route', ms, false);

        return res.status(502).json({
          ok: false,
          code: first.error === 'timeout' ? 'provider_timeout' : 'provider_error',
          message: first.error || first.json?.message || 'Route computation failed'
        });
      }

      // Success - build response from OSRM
      const route = first.json.routes[0];
      payload = {
        ok: true,
        distance_m: Math.round(route.distance ?? 0),
        duration_s: Math.round(route.duration ?? 0),
        geometry: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: route.geometry // GeoJSON LineString from OSRM
          }]
        },
        route_retry_relaxed: relaxed
      };
    }

    const ms = Date.now() - startTime;

    // Cache the successful response
    cache.set(k, payload);

    // Update counters
    incrProvider(provider);
    if (payload.route_retry_relaxed) {
      incrRelaxed();
    }

    // Log successful route event
    req.log.info({
      event: 'route_ok',
      provider,
      exclude,
      route_retry_relaxed: payload.route_retry_relaxed,
      distance_m: payload.distance_m,
      duration_s: payload.duration_s,
      route: k,
      ms
    }, 'Route computed successfully');

    // Record metrics
    observe('route', ms, true);

    return res.json(payload);

  } catch (error) {
    req.log.error({ err: error }, 'Unexpected error');
    return res.status(500).json({
      ok: false,
      code: 'internal_error',
      message: error.message
    });
  }
});

/**
 * POST /api/matrix (dev endpoint)
 * Test Google Distance Matrix v2 integration
 */
router.post('/matrix', async (req, res) => {
  try {
    const { points, mode, departureTime } = req.body || {};
    if (!Array.isArray(points) || points.length < 2) {
      return res.status(400).json({ ok: false, code: 'invalid_points' });
    }

    const out = await getTravelMatrix(points, { mode, departureTimeIso: departureTime });

    req.log.info({
      event: 'matrix_ok',
      n: out.n,
      mode: mode || 'DRIVE'
    });

    return res.json({
      ok: true,
      n: out.n,
      sample: out.matrix.duration_s.slice(0, 3).map(r => r.slice(0, 3))
    });
  } catch (e) {
    req.log.error({ event: 'matrix_err', err: String(e) });
    return res.status(502).json({ ok: false, code: 'matrix_error' });
  }
});

export default router;
