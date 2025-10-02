// ---- Provider Health Checks ----
// Simple reachability checks for external dependencies (OSRM, Overpass)

/**
 * Ping a URL with timeout
 * @param {string} url - URL to ping
 * @param {number} timeoutMs - Timeout in milliseconds (default: 4000)
 * @returns {Promise<{up: boolean, ms: number|null, status: number|null}>}
 */
export async function ping(url, timeoutMs = 4000) {
  if (!url) {
    return { up: false, ms: null, status: null };
  }

  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = Date.now();

  try {
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(tid);
    return {
      up: r.ok,
      ms: Date.now() - t0,
      status: r.status,
    };
  } catch (e) {
    clearTimeout(tid);
    return {
      up: false,
      ms: Date.now() - t0,
      status: null,
    };
  }
}

/**
 * Ping OpenRouteService (ORS) status endpoint
 * @returns {Promise<{up: boolean, ms: number|null, status: number|null}>}
 */
async function pingOrs() {
  if (!process.env.ORS_API_KEY) {
    return { up: false, ms: null, status: null };
  }

  const t0 = Date.now();
  try {
    const r = await fetch(
      `${process.env.ORS_URL || 'https://api.openrouteservice.org'}/status`
    );
    return {
      up: r.ok,
      ms: Date.now() - t0,
      status: r.status,
    };
  } catch (e) {
    return {
      up: false,
      ms: Date.now() - t0,
      status: null,
    };
  }
}

/**
 * Check health of all external providers
 * @returns {Promise<{osrm: Object, overpass: Object, ors: Object}>}
 */
export async function healthProviders() {
  // OSRM routing service check with a simple route query
  const osrm = process.env.OSRM_URL
    ? await ping(
        `${process.env.OSRM_URL}/route/v1/driving/34.78,32.08;34.80,32.08?overview=false`
      )
    : { up: false, ms: null, status: null };

  // Overpass API check
  const overpass = process.env.OVERPASS_URL
    ? await ping(process.env.OVERPASS_URL)
    : { up: false, ms: null, status: null };

  // OpenRouteService check
  const ors = await pingOrs();

  return { osrm, overpass, ors };
}
