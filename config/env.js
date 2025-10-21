// ---- Environment Variable Validation ----
// Validates and parses all environment variables at startup

import { ROUTE_CACHE_MAX, ROUTE_CACHE_TTL_MS, HAZ_CACHE_TTL_MS, METRICS_WINDOW_MS } from '../constants/cache.js';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../constants/timeouts.js';

/**
 * Parse and validate an integer environment variable
 * @param {string} name - Environment variable name
 * @param {number} defaultValue - Default value if not set
 * @param {number} [min] - Minimum allowed value
 * @returns {number} Parsed integer
 */
function parseIntEnv(name, defaultValue, min = 0) {
  const value = process.env[name];
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid ${name}: must be a valid integer`);
  }
  if (parsed < min) {
    throw new Error(`Invalid ${name}: must be >= ${min}`);
  }
  return parsed;
}

/**
 * Parse and validate a URL environment variable
 * @param {string} name - Environment variable name
 * @param {string} defaultValue - Default URL
 * @returns {string} Validated URL
 */
function parseUrlEnv(name, defaultValue) {
  const value = process.env[name] || defaultValue;
  if (value && !value.match(/^https?:\/\//)) {
    throw new Error(`Invalid ${name}: must be a valid HTTP(S) URL`);
  }
  return value;
}

/**
 * Validate all environment variables and export configuration
 */
export function validateEnv() {
  return {
    // Server config
    PORT: parseIntEnv('PORT', 8080, 1),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    NODE_ENV: process.env.NODE_ENV || 'development',

    // Secrets
    JWT_SECRET: process.env.JWT_SECRET || 'roamwise-dev-secret-change-in-production',
    SESSION_SECRET: process.env.SESSION_SECRET || 'roamwise-family-session-secret-change-in-production',

    // External services
    OSRM_URL: parseUrlEnv('OSRM_URL', 'http://localhost:5000'),
    ORS_URL: parseUrlEnv('ORS_URL', 'https://api.openrouteservice.org'),
    ORS_API_KEY: process.env.ORS_API_KEY || '',
    OVERPASS_URL: parseUrlEnv('OVERPASS_URL', ''),
    HAZ_WEATHER_URL: parseUrlEnv('HAZ_WEATHER_URL', ''),
    HAZ_TRAFFIC_URL: parseUrlEnv('HAZ_TRAFFIC_URL', ''),
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',

    // Timeouts
    ROUTE_TIMEOUT_MS: parseIntEnv('ROUTE_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS, 1000),
    HAZ_TIMEOUT_MS: parseIntEnv('HAZ_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS, 1000),

    // Cache configuration
    ROUTE_CACHE_MAX: parseIntEnv('ROUTE_CACHE_MAX', ROUTE_CACHE_MAX, 1),
    ROUTE_CACHE_TTL_MS: parseIntEnv('ROUTE_CACHE_TTL_MS', ROUTE_CACHE_TTL_MS, 1000),
    HAZ_CACHE_TTL_MS: parseIntEnv('HAZ_CACHE_TTL_MS', HAZ_CACHE_TTL_MS, 1000),

    // Metrics
    METRICS_WINDOW_MS: parseIntEnv('METRICS_WINDOW_MS', METRICS_WINDOW_MS, 1000),

    // Feature flags
    ROUTE_TEST_HOOKS: process.env.ROUTE_TEST_HOOKS === '1',
  };
}

// Validate and export config at module load time
export const config = validateEnv();
