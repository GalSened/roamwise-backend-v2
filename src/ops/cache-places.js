// 10-min TTL cache for search; 6-hour TTL for details (respect TOS; no long-term storage)
const cache = new Map();

function keySearch({query, openNow, minRating, priceLevels, includedType, biasCircle, lang}) {
  const bias = biasCircle ? `${biasCircle.center.latitude.toFixed(3)},${biasCircle.center.longitude.toFixed(3)}:${biasCircle.radius}` : 'none';
  const pl = Array.isArray(priceLevels) ? priceLevels.join('-') : 'any';
  return `S|${lang}|${query}|${openNow}|${minRating}|${pl}|${includedType||'any'}|${bias}`;
}
function keyDetails(id, lang){ return `D|${lang}|${id}`; }

export function getSearchCache(k) {
  const e = cache.get(k); if (!e) return null;
  if (Date.now() - e.t > 10*60*1000) { cache.delete(k); return null; }
  return e.v;
}
export function setSearchCache(k, v){ cache.set(k, { t: Date.now(), v }); }

export function getDetailsCache(k) {
  const e = cache.get(k); if (!e) return null;
  if (Date.now() - e.t > 6*60*60*1000) { cache.delete(k); return null; }
  return e.v;
}
export function setDetailsCache(k, v){ cache.set(k, { t: Date.now(), v }); }

export const cacheKeys = { keySearch, keyDetails };
