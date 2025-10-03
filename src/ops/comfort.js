// src/ops/comfort.js
// Map weather snapshot to comfort tags + outfit hint

export function comfortFromWeather(w) {
  const tags = [];
  const uv = num(w.uv_index);
  const wind = num(w.wind_kmh);
  const precip = num(w.precip_pct);
  const feels = num(w.feels_c);

  if (uv >= 6 || feels >= 32) tags.push('UV');
  if (feels >= 33) tags.push('HEAT');
  if (precip >= 40) tags.push('RAIN');
  if (wind >= 30) tags.push('WIND');

  const hint = buildHint({ uv, wind, precip, feels });
  return { tags, hint };
}

function buildHint({ uv, wind, precip, feels }) {
  const pieces = [];
  if (uv >= 6) pieces.push('SPF 50 + hat');
  if (feels >= 33) pieces.push('light long sleeves');
  if (precip >= 40) pieces.push('compact umbrella');
  if (wind >= 30) pieces.push('windbreaker');
  if (!pieces.length) return 'comfortable conditions';
  return pieces.join('; ');
}

function num(x) { return (x === null || x === undefined) ? 0 : Number(x); }
