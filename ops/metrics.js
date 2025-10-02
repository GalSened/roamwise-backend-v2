// ---- In-Memory RED Metrics ----
// Tiny rolling-window histogram for Rate/Errors/Duration monitoring
// No external deps, no persisted state

const WINDOW_MS = Number(process.env.METRICS_WINDOW_MS || 10 * 60 * 1000);
const buckets = [50, 100, 200, 300, 400, 600, 800, 1200, 2000, 3000, 5000, 8000, 12000];

// Service tracking structure
const services = {};

function makeSvc() {
  return { reqs: 0, errs: 0, samples: [] };
}

function now() {
  return Date.now();
}

/**
 * Record a service call observation
 * @param {string} kind - Service name (route, places, hazards, profile_get, profile_put)
 * @param {number} ms - Duration in milliseconds
 * @param {boolean} ok - Whether the call succeeded (default: true)
 */
export function observe(kind, ms, ok = true) {
  const s = services[kind] || (services[kind] = makeSvc());
  s.reqs++;
  if (!ok) s.errs++;
  s.samples.push([now(), ms]);

  // Trim old samples outside window
  const cutoff = now() - WINDOW_MS;
  while (s.samples.length && s.samples[0][0] < cutoff) {
    s.samples.shift();
  }
}

/**
 * Calculate percentile from sorted array of numbers
 * @param {number[]} sorted - Sorted array of values
 * @param {number} p - Percentile (0.0-1.0)
 * @returns {number|null} - Percentile value or null if empty
 */
function pct(sorted, p) {
  if (!sorted.length) return null;
  sorted.sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/**
 * Get snapshot of current metrics for all services
 * @returns {Object} - Metrics snapshot with RED stats per service
 */
export function snapshot() {
  const out = {};
  const cutoff = now() - WINDOW_MS;

  for (const [k, s] of Object.entries(services)) {
    // Filter to recent samples within window
    const recent = s.samples.filter(([t]) => t >= cutoff).map(([, ms]) => ms);

    const p50 = pct(recent.slice(), 0.5);
    const p95 = pct(recent.slice(), 0.95);

    out[k] = {
      window_ms: WINDOW_MS,
      reqs: s.reqs,
      errors: s.errs,
      error_rate: s.reqs ? +(s.errs / s.reqs).toFixed(4) : 0,
      p50_ms: p50,
      p95_ms: p95,
      rps_estimate: +(recent.length / (WINDOW_MS / 1000)).toFixed(3),
      buckets: Object.fromEntries(
        buckets.map((b) => [b, recent.filter((ms) => ms <= b).length])
      ),
    };
  }

  return out;
}
