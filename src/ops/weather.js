// src/ops/weather.js
// Tiny Open-Meteo client with 10-min cache and hourly data

const CACHE = new Map();
const TTL_MS = 10 * 60 * 1000;

function cacheKey(lat, lon, hourIso) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}:${hourIso.slice(0,13)}`; // hour bucket
}

export async function getHourlyWeather({ lat, lon, timeIso }) {
  // Round time to the hour Open-Meteo uses
  const hourIso = new Date(timeIso);
  hourIso.setMinutes(0, 0, 0);
  const hourStr = hourIso.toISOString();

  const key = cacheKey(lat, lon, hourStr);
  const hit = CACHE.get(key);
  const now = Date.now();
  if (hit && (now - hit.t) < TTL_MS) return hit.v;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('timezone', 'auto'); // let API resolve local zone
  url.searchParams.set('hourly', [
    'temperature_2m',
    'relative_humidity_2m',
    'apparent_temperature',
    'precipitation_probability',
    'uv_index',
    'wind_speed_10m'
  ].join(','));

  const r = await fetch(url.toString(), { method: 'GET' });
  if (!r.ok) throw new Error(`weather_http_${r.status}`);
  const j = await r.json();

  // Find the index of the requested hour
  const H = j.hourly || {};
  const times = H.time || [];
  const idx = times.findIndex(t => t.startsWith(hourStr.slice(0,13))); // YYYY-MM-DDTHH
  if (idx < 0) throw new Error('weather_hour_not_found');

  const out = {
    time: times[idx],
    temp_c: pick(H.temperature_2m, idx),
    rh_pct: pick(H.relative_humidity_2m, idx),
    feels_c: pick(H.apparent_temperature, idx),
    precip_pct: pick(H.precipitation_probability, idx),
    uv_index: pick(H.uv_index, idx),
    wind_kmh: pick(H.wind_speed_10m, idx)
  };

  CACHE.set(key, { t: now, v: out });
  return out;
}

function pick(arr, i) {
  const v = Array.isArray(arr) ? arr[i] : undefined;
  return (v === null || v === undefined) ? null : v;
}
