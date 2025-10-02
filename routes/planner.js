// routes/planner.js - Day planning endpoint
import express from 'express';
import { placesTextSearch, placeDetails } from '../src/providers/google-places.js';
import { googleComputeRouteMatrix } from '../src/providers/google-matrix.js';
import { searchAlongRoute } from './sar.js';

const router = express.Router();

/**
 * Helper: Resolve origin from coordinates or query string
 * @returns {ok, center: {lat, lon}, source: 'current'|'hotel', name?}
 */
async function resolvePlaceCenterByQueryOrCoords({ lat, lon, query, lang='he' }) {
  // If coords provided, use them directly
  if (lat && lon) {
    return { ok: true, center: { lat, lon }, source: 'current' };
  }

  // Otherwise resolve via query
  if (!query) {
    return { ok: false, error: 'No coords or query provided' };
  }

  const resp = await placesTextSearch({
    query,
    openNow: undefined,
    minRating: 0,
    lang
  });

  if (!resp.ok || !resp.items || resp.items.length === 0) {
    return { ok: false, error: 'No results for query' };
  }

  const top = resp.items[0];
  return {
    ok: true,
    center: {
      lat: top.location?.latitude,
      lon: top.location?.longitude
    },
    source: 'hotel',
    name: top.displayName?.text || query
  };
}

/**
 * Helper: Collect POI candidates near origin within radius_km
 * @returns {ok, candidates: [...]}
 */
async function collectNearOriginCandidates({ center, radius_km=5, types=[], min_rating=4.3, open_now=false, limit=20, lang='he' }) {
  const all = [];
  const seen = new Set();

  // If types array provided, search each type
  const searchTypes = types.length > 0 ? types : ['tourist_attraction'];

  for (const typ of searchTypes) {
    const resp = await placesTextSearch({
      query: typ.replace(/_/g, ' '),
      biasCircle: {
        center: { latitude: center.lat, longitude: center.lon },
        radius: radius_km * 1000
      },
      openNow: open_now ? true : undefined,
      minRating: min_rating,
      includedType: typ,
      lang
    });

    if (!resp.ok || !resp.items) continue;

    for (const r of resp.items) {
      if (!r.id || seen.has(r.id)) continue;
      seen.add(r.id);
      all.push({
        place_id: r.id,
        name: r.displayName?.text || 'Unknown',
        rating: r.rating,
        user_ratings_total: r.userRatingCount,
        loc: {
          lat: r.location?.latitude,
          lon: r.location?.longitude
        }
      });
    }

    if (all.length >= limit) break;
  }

  // Sort by rating * log(reviews)
  all.sort((a,b) =>
    ((b.rating||0)*Math.log1p(b.user_ratings_total||0)) -
    ((a.rating||0)*Math.log1p(a.user_ratings_total||0))
  );

  return { ok: true, candidates: all.slice(0, limit) };
}

/**
 * POST /planner/plan-day
 * {
 *   origin?: {lat, lon},
 *   origin_query?: "Hotel Splendido, Sirmione",  // alternative to origin coords
 *   dest?: {lat, lon},
 *   date: "2025-10-05",
 *   start_time_local: "09:00",
 *   end_time_local: "19:00",
 *   mode: "drive" | "walk" | "bicycle" | "transit",
 *   near_origin?: {
 *     radius_km: 5,
 *     types: ["tourist_attraction", "ice_cream"],
 *     min_rating: 4.3,
 *     open_now: false,
 *     limit: 20
 *   },
 *   sar?: {
 *     query: "gelato",
 *     max_detour_min: 15,
 *     max_results: 12
 *   },
 *   lang?: "he"|"en"
 * }
 */
router.post('/planner/plan-day', async (req, res) => {
  try {
    const lang = (req.header('x-lang') || req.body.lang || 'he').slice(0,2);
    const { origin, origin_query, dest, mode='drive', near_origin, sar } = req.body || {};

    // 1) Resolve origin from coords or query
    const originRes = await resolvePlaceCenterByQueryOrCoords({
      lat: origin?.lat,
      lon: origin?.lon ?? origin?.lng,
      query: origin_query,
      lang
    });

    if (!originRes.ok) {
      return res.status(400).json({ ok:false, code:'invalid_request', error: originRes.error });
    }

    const O = originRes.center;
    const D = dest?.lat ? { lat: dest.lat, lon: (dest.lon ?? dest.lng) } : O;
    const planMode = (D.lat === O.lat && D.lon === O.lon) ? 'NEARBY' : 'A2B';

    // 2) Collect near-origin candidates if requested
    let picks = [];
    let metadata = {
      origin_source: originRes.source,
      origin_name: originRes.name,
      near_origin_scanned: false,
      sar_scanned: false
    };

    if (near_origin) {
      const nearRes = await collectNearOriginCandidates({
        center: O,
        radius_km: near_origin.radius_km ?? 5,
        types: near_origin.types ?? [],
        min_rating: near_origin.min_rating ?? 4.3,
        open_now: near_origin.open_now ?? false,
        limit: near_origin.limit ?? 20,
        lang
      });

      if (nearRes.ok) {
        picks = nearRes.candidates.filter(c => c.loc.lat && c.loc.lon);
        metadata.near_origin_scanned = true;
        metadata.near_origin_count = picks.length;
      }
    }

    // 3) If no near-origin candidates, return empty plan
    if (picks.length === 0) {
      return res.json({
        ok: true,
        plan: {
          summary: { origin: O, dest: D, mode, count: 0, plan_mode: planMode, ...metadata },
          order: [],
          timeline: []
        }
      });
    }

    // 4) Build TSP order: O -> picks[0..n] -> D
    const waypoints = [O, ...picks.map(p => p.loc), D];
    const matrixResp = await googleComputeRouteMatrix(waypoints, { mode: mode.toUpperCase() });

    if (!matrixResp.ok || !matrixResp.matrix) {
      return res.status(502).json({ ok:false, code:'matrix_error' });
    }

    const n = waypoints.length;
    const dur = matrixResp.matrix.duration_s;

    // Greedy nearest-neighbor TSP
    const order = [0];
    const unused = new Set(Array.from({length: n-2}, (_,k) => k+1));
    while (unused.size) {
      const last = order[order.length-1];
      let best = null;
      let bestd = Infinity;
      for (const idx of unused) {
        const d = dur[last][idx];
        if (d < bestd) {
          bestd = d;
          best = idx;
        }
      }
      if (best !== null) {
        order.push(best);
        unused.delete(best);
      } else {
        break;
      }
    }
    order.push(n-1);

    // 5) Build timeline with cumulative ETAs
    let cum = 0;
    const timeline = [];
    for (let i=0; i<order.length-1; i++) {
      const a = order[i], b = order[i+1];
      const leg_s = dur[a][b];

      const from = (a===0) ? {kind:'origin', ...O} :
                  (a===n-1) ? {kind:'dest', ...D} :
                  {kind:'poi', ...picks[a-1]};

      const to = (b===0) ? {kind:'origin', ...O} :
                (b===n-1) ? {kind:'dest', ...D} :
                {kind:'poi', ...picks[b-1]};

      timeline.push({
        from,
        to,
        leg_seconds: Number.isFinite(leg_s) ? leg_s : null,
        eta_seconds: Number.isFinite(leg_s) ? (cum += leg_s) : null
      });
    }

    // 6) Optionally run SAR along the route
    if (sar?.query && timeline.length > 0) {
      const routeStops = timeline.map(t => t.from).concat([timeline[timeline.length-1].to])
        .filter(p => p.lat && p.lon)
        .map(p => ({lat: p.lat, lon: p.lon}));

      if (routeStops.length >= 2) {
        const sarResults = await searchAlongRoute({
          query: sar.query,
          maxResults: sar.maxResults ?? sar.max_results ?? 12,
          maxDetourMin: sar.maxDetourMin ?? sar.max_detour_min ?? 15,
          stops: routeStops,
          mode,
          lang,
          enrichDetails: false
        });

        metadata.sar_scanned = true;
        metadata.sar_count = sarResults.length;
        metadata.sar_results = sarResults;
      }
    }

    // 7) Enrich first 3 POIs with details
    let enriched = 0;
    for (const t of timeline) {
      if (enriched >= 3) break;
      if (t.to?.kind === 'poi' && t.to.place_id) {
        const det = await placeDetails(t.to.place_id, lang);
        if (det.ok && det.detail) {
          t.to.hours = det.detail.currentOpeningHours ?? null;
          t.to.formatted_address = det.detail.formattedAddress ?? null;
          t.to.website = det.detail.websiteUri ?? null;
          enriched++;
        }
      }
    }

    res.json({
      ok: true,
      plan: {
        summary: {
          origin: O,
          dest: D,
          mode,
          count: picks.length,
          plan_mode: planMode,
          ...metadata
        },
        order,
        timeline
      }
    });
  } catch (err) {
    req.log?.error({ event: 'planner_err', err: err?.message });
    res.status(500).json({ ok:false, code:'internal_error' });
  }
});

export default router;
