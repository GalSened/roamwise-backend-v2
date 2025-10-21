// ---- Timeout Constants ----
// Centralized timeout configuration for external API calls

export const CIRCUIT_BREAKER_5XX_TIMEOUT_MS = 60_000; // 60 seconds for 5xx errors
export const CIRCUIT_BREAKER_NETWORK_TIMEOUT_MS = 30_000; // 30 seconds for network/timeout errors
export const DEFAULT_REQUEST_TIMEOUT_MS = 12_000; // 12 seconds for API requests
export const SESSION_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
