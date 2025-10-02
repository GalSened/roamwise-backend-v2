// Simple 60s cache by (mode|pointsHash|bucketedTime)
const store = new Map();

function hashPoints(points) {
  return points.map(p => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join('|');
}
function timeBucket(iso) {
  // 5-minute buckets to increase hit rate
  const t = iso ? Date.parse(iso) : Date.now();
  return Math.floor(t / (5*60*1000));
}

export function getMatrixCache(mode, points, iso) {
  const key = `${mode}|${hashPoints(points)}|${timeBucket(iso)}`;
  const ent = store.get(key);
  if (!ent) return { hit:false, key };
  if (Date.now() - ent.t > 60_000) { store.delete(key); return { hit:false, key }; }
  return { hit:true, key, value: ent.v };
}

export function setMatrixCache(key, value) {
  store.set(key, { t: Date.now(), v: value });
}
