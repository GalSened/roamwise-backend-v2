// ---- Route Counters ----
// In-memory counters for route relaxation and provider mix tracking
// Resets on deploy (stateless, simple home app solution)

const counters = {
  route_relaxed_count: 0,
  provider_mix: {}
};

/**
 * Increment relaxed route counter
 */
export function incrRelaxed() {
  counters.route_relaxed_count++;
}

/**
 * Increment provider usage counter
 * @param {string} name - Provider name (ors, osrm, osrm_relaxed, etc.)
 */
export function incrProvider(name) {
  if (!name) return;
  counters.provider_mix[name] = (counters.provider_mix[name] || 0) + 1;
}

/**
 * Get current counter snapshot
 * @returns {{route_relaxed_count: number, provider_mix: Object}}
 */
export function snapshotCounters() {
  return {
    route_relaxed_count: counters.route_relaxed_count,
    provider_mix: { ...counters.provider_mix }
  };
}
