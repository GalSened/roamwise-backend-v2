// ---- Cache Constants ----
// Centralized cache configuration

export const ROUTE_CACHE_MAX = 1000; // Maximum number of cached routes
export const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const HAZ_CACHE_MAX = 500; // Maximum number of cached hazards
export const HAZ_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const METRICS_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const COORDINATE_PRECISION_DECIMALS = 5; // ~1.1 meter precision for cache keys
