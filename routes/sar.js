// routes/sar.js - Search Along Route endpoint
import express from 'express';
import polyline from '@mapbox/polyline';
import { placesTextSearch, placeDetails } from '../src/providers/google-places.js';
import { googleComputeRouteMatrix } from '../src/providers/google-matrix.js';

const router = express.Router();

/**
 * Internal SAR function - reusable from planner or direct endpoint
 * @param {Object} params
 * @param {string} params.query - search query (e.g., "gelato")
 * @param {number} params.maxResults - max results to return
 * @param {number} params.maxDetourMin - max detour in minutes
 * @param {Array<{lat, lon}>} params.stops - route waypoints
 * @param {string} params.mode - travel mode (drive/walk/bicycle/transit)
 * @param {string} params.lang - language code (he/en)
 * @param {boolean} params.enrichDetails - whether to fetch place details
 * @returns {Promise<Array>} scored POIs with detour_min
 */
export async function searchAlongRoute({ query, maxResults=12, maxDetourMin=15, stops=[], mode='drive', lang='he', enrichDetails=true }) {
  if (!query || !stops || stops.length < 2) {
    return [];
  }

  // 1) Downsample route points
  const pts = stops.map(s => ({lat: s.lat, lon: s.lon ?? s.lng}));
  const sample = [];
  const step = Math.max(1, Math.floor(pts.length / 20));
  for (let i = 0; i < pts.length; i += step) sample.push(pts[i]);
  if (sample[sample.length-1] !== pts[pts.length-1]) sample.push(pts[pts.length-1]);

  // 2) Candidate search around sampled points
  const seen = new Set();
  const candidates = [];
  for (const p of sample) {
    const resp = await placesTextSearch({
      query,
      biasCircle: {
        center: { latitude: p.lat, longitude: p.lon },
        radius: 2000
      },
      openNow: undefined,
      minRating: 0,
      lang
    });
    if (!resp.ok) continue;

    for (const r of (resp.items || [])) {
      if (!r.id || seen.has(r.id)) continue;
      seen.add(r.id);
      candidates.push(r);
    }
    if (candidates.length > 50) break;
  }

  if (candidates.length === 0) return [];

  // 3) Compute detour for each candidate
  const origin = sample[0];
  const dest = sample[sample.length - 1];
  const scored = [];

  for (const c of candidates) {
    const cpt = { lat: c.location?.latitude ?? c.lat, lon: c.location?.longitude ?? c.lon };
    if (!cpt.lat || !cpt.lon) continue;

    const m = await googleComputeRouteMatrix([origin, cpt, dest], { mode: mode.toUpperCase() });
    if (!m.ok || !m.matrix) continue;

    const o_to_c = m.matrix.duration_s[0][1];
    const c_to_d = m.matrix.duration_s[1][2];
    const o_to_d = m.matrix.duration_s[0][2];

    if (![o_to_c, c_to_d, o_to_d].every(Number.isFinite)) continue;

    const detour_s = (o_to_c + c_to_d) - o_to_d;
    const detour_min = Math.max(0, Math.round(detour_s / 60));

    if (detour_min <= maxDetourMin) {
      scored.push({
        place_id: c.id,
        name: c.displayName?.text || c.name,
        rating: c.rating,
        user_ratings_total: c.userRatingCount,
        price_level: c.priceLevel,
        location: { lat: cpt.lat, lon: cpt.lon },
        detour_min
      });
    }
  }

  // 4) Sort and limit
  scored.sort((a,b) => (a.detour_min - b.detour_min) ||
                       ((b.rating||0)*Math.log1p(b.user_ratings_total||0) - (a.rating||0)*Math.log1p(a.user_ratings_total||0)));
  const top = scored.slice(0, maxResults);

  // 5) Enrich with details if requested
  if (enrichDetails) {
    for (let i=0; i<Math.min(6, top.length); i++) {
      const d = await placeDetails(top[i].place_id, lang);
      if (d.ok && d.detail) {
        top[i].hours = d.detail.currentOpeningHours ?? null;
        top[i].formatted_address = d.detail.formattedAddress ?? null;
        top[i].website = d.detail.websiteUri ?? null;
      }
    }
  }

  return top;
}

/**
 * POST /api/poi/along-route
 * body: {
 *   query: string,
 *   maxResults?: number (default 12),
 *   maxDetourMin?: number (default 15),
 *   route: { polyline?: string, stops?: [{lat,lon}, ...], mode?: 'drive'|'walk'|'bicycle'|'transit' }
 *   lang?: 'he'|'en' (fallback to header x-lang)
 * }
 */
router.post('/api/poi/along-route', async (req, res) => {
  try {
    const lang = (req.header('x-lang') || req.body.lang || 'he').slice(0,2);
    const { query, maxResults=12, maxDetourMin=15, route={} } = req.body || {};
    const { polyline: pl, stops=[], mode='drive' } = route;

    if (!query) return res.status(400).json({ ok:false, code:'invalid_request', error:'query required' });
    if (!pl && (!stops || stops.length < 2)) {
      return res.status(400).json({ ok:false, code:'invalid_request', error:'route.polyline or route.stops (>=2) required' });
    }

    // Decode polyline if provided, otherwise use stops
    let pts = [];
    if (pl) {
      pts = polyline.decode(pl).map(([lat, lng]) => ({lat, lon: lng}));
    } else {
      pts = stops.map(s => ({lat: s.lat, lon: s.lon ?? s.lng}));
    }

    // Call internal SAR function
    const results = await searchAlongRoute({
      query,
      maxResults,
      maxDetourMin,
      stops: pts,
      mode,
      lang,
      enrichDetails: true
    });

    res.json({ ok:true, count: results.length, results });
  } catch (err) {
    req.log?.error({ event: 'sar_err', err: err?.message });
    res.status(500).json({ ok:false, code:'internal_error' });
  }
});

export default router;
