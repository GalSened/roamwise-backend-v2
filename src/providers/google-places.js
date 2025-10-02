// Google Places API (New): Text Search + Details
// Minimal, cost-aware (FieldMasks), localized via Accept-Language / languageCode.

const SEARCH_URL  = 'https://places.googleapis.com/v1/places:searchText';
const DETAILS_URL = (id) => `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`;
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

function scorePlace(p) {
  const rating = p.rating || 0;
  const n = p.userRatingCount || 0;
  return rating * Math.log1p(n);
}

export async function placesTextSearch({ query, openNow=false, minRating=0, priceLevels, includedType, biasCircle, lang='he' }) {
  if (!API_KEY) return { ok:false, error:'no_api_key' };

  const body = {
    textQuery: query,
    openNow: !!openNow,
    // Either includedType (single) or rely on the textQuery; keep simple here:
    ...(includedType ? { includedType } : {}),
    ...(Array.isArray(priceLevels) && priceLevels.length ? { priceLevels } : {}),
    ...(biasCircle ? { locationBias: { circle: biasCircle } } : {})
  };

  const r = await fetch(SEARCH_URL, {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.location',
        'places.rating',
        'places.userRatingCount',
        'places.priceLevel',
        'places.currentOpeningHours'
      ].join(','),
      'Accept-Language': lang
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) return { ok:false, status:r.status, body: await r.text() };

  const j = await r.json();
  const items = (j.places || [])
    .filter(p => !minRating || (p.rating || 0) >= minRating)
    .map(p => ({ ...p, _score: scorePlace(p) }))
    .sort((a,b) => b._score - a._score);

  return { ok:true, items };
}

export async function placeDetails(placeId, lang='he') {
  if (!API_KEY) return { ok:false, error:'no_api_key' };
  const url = DETAILS_URL(placeId) +
    '?fields=' + encodeURIComponent([
      'id',
      'displayName',
      'location',
      'currentOpeningHours',
      'utcOffsetMinutes',
      'rating',
      'userRatingCount',
      'priceLevel',
      'websiteUri',
      'internationalPhoneNumber',
      'photos' // metadata only; fetching photo bytes uses separate API if needed
    ].join(','))
    + `&languageCode=${encodeURIComponent(lang)}`;

  const r = await fetch(url, { headers: { 'X-Goog-Api-Key': API_KEY, 'Accept-Language': lang } });
  if (!r.ok) return { ok:false, status:r.status, body: await r.text() };
  return { ok:true, detail: await r.json() };
}
