// Google Distance Matrix v2: computeRouteMatrix (NDJSON streaming)
// Returns an object { ok, n, matrix: { duration_s[i][j], distance_m[i][j] } }
// Notes: traffic-aware when departureTime is set (now/ISO8601)

const URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

function toMode(mode) {
  const m = String(mode||'DRIVE').toUpperCase();
  return ['DRIVE','WALK','BICYCLE','TWO_WHEELER','TRANSIT'].includes(m) ? m : 'DRIVE';
}

function parseDurationSeconds(s) {
  if (!s) return 0;
  if (typeof s === 'number') return Math.round(s);
  const m = String(s).match(/^(\d+)s$/);
  return m ? parseInt(m[1],10) : 0;
}

export async function googleComputeRouteMatrix(points, { mode='DRIVE', departureTimeIso } = {}) {
  if (!API_KEY) return { ok:false, error:'no_api_key' };
  if (!Array.isArray(points) || points.length < 2) return { ok:false, error:'need 2+ points' };

  const origins = points.map(p => ({ waypoint:{ location:{ latLng:{ latitude:p.lat, longitude:p.lon }}}}));
  const destinations = points.map(p => ({ waypoint:{ location:{ latLng:{ latitude:p.lat, longitude:p.lon }}}}));

  // Google requires departure time to be in the future for traffic-aware routing
  const futureTime = departureTimeIso || new Date(Date.now() + 60000).toISOString(); // 1 minute in future
  const travelMode = toMode(mode);

  const body = {
    origins, destinations,
    travelMode,
    departureTime: futureTime,
    // Only add routing preference for DRIVE mode (WALK/BICYCLE don't support it)
    ...(travelMode === 'DRIVE' && { routingPreference: 'TRAFFIC_AWARE' })
  };

  const r = await fetch(URL, {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition'
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const txt = await r.text().catch(()=> '');
    return { ok:false, status:r.status, body:txt };
  }

  // Parse response (JSON array format)
  const lines = await r.json();

  const n = points.length;
  const duration_s = Array.from({length:n}, ()=> Array(n).fill(Infinity));
  const distance_m = Array.from({length:n}, ()=> Array(n).fill(Infinity));

  for (const row of lines) {
    const i = row.originIndex, j = row.destinationIndex;
    const d = parseDurationSeconds(row.duration);
    const m = row.distanceMeters ?? 0;
    duration_s[i][j] = d;
    distance_m[i][j] = m;
  }
  return { ok:true, n, matrix:{ duration_s, distance_m } };
}
