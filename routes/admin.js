// ---- Admin Health Routes ----
// Expose RED metrics and provider health as JSON and HTML dashboard

import express from 'express';
import { snapshot } from '../ops/metrics.js';
import { healthProviders } from '../ops/providers.js';
import { snapshotCounters } from '../ops/counters.js';
import pkg from '../package.json' with { type: 'json' };

const router = express.Router();

/**
 * GET /admin/healthz - JSON health check endpoint
 * Returns: ok, version, metrics, providers, config
 * Status: 200 if healthy, 503 if OSRM down
 */
router.get('/admin/healthz', async (_req, res) => {
  const providers = await healthProviders();
  const metrics = snapshot();

  // Healthy if OSRM is up (or not configured)
  const healthy = providers.osrm?.up !== false;

  const payload = {
    ok: healthy,
    ts: Date.now(),
    version: pkg.version || 'dev',
    metrics,
    providers,
    counters: snapshotCounters(),
    config: {
      window_ms: Number(process.env.METRICS_WINDOW_MS || 10 * 60 * 1000),
      osrm_url: !!process.env.OSRM_URL,
      overpass_url: !!process.env.OVERPASS_URL,
      ors_url: !!process.env.ORS_URL,
      ors_api_key: !!process.env.ORS_API_KEY,
    },
  };

  res.status(healthy ? 200 : 503).json(payload);
});

/**
 * GET /admin/health - HTML dashboard
 * Self-contained HTML page with inline CSS/JS that fetches from /admin/healthz
 */
router.get('/admin/health', async (_req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RoamWise Health Dashboard</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  padding: 2rem;
}
.container {
  max-width: 1200px;
  margin: 0 auto;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  padding: 2rem;
}
h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  color: #333;
}
.meta {
  color: #666;
  margin-bottom: 2rem;
  font-size: 0.9rem;
}
.status {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.85rem;
  margin-left: 1rem;
}
.status.ok {
  background: #d4edda;
  color: #155724;
}
.status.error {
  background: #f8d7da;
  color: #721c24;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}
.card {
  background: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 1.5rem;
}
.card h2 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: #444;
}
.metric {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
}
.metric .label {
  color: #666;
}
.metric .value {
  font-weight: 600;
  color: #333;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}
th, td {
  text-align: left;
  padding: 0.75rem;
  border-bottom: 1px solid #e0e0e0;
}
th {
  background: #f5f5f5;
  font-weight: 600;
  color: #555;
}
td {
  color: #333;
}
.loading {
  text-align: center;
  padding: 2rem;
  color: #999;
}
.error-msg {
  background: #f8d7da;
  color: #721c24;
  padding: 1rem;
  border-radius: 6px;
  margin: 1rem 0;
}
</style>
</head>
<body>
<div class="container">
  <h1>RoamWise Health Dashboard</h1>
  <div class="meta" id="meta">Loading...</div>
  <div id="content" class="loading">Fetching health data...</div>
</div>
<script>
async function loadHealth() {
  try {
    const r = await fetch('/admin/healthz');
    const data = await r.json();

    // Update meta
    const statusClass = data.ok ? 'ok' : 'error';
    const statusText = data.ok ? 'Healthy' : 'Degraded';
    document.getElementById('meta').innerHTML =
      \`Version: \${data.version} | Timestamp: \${new Date(data.ts).toLocaleString()}\` +
      \`<span class="status \${statusClass}">\${statusText}</span>\`;

    // Build content
    let html = '<div class="grid">';

    // Providers card
    html += '<div class="card"><h2>External Providers</h2>';
    for (const [name, info] of Object.entries(data.providers)) {
      const status = info.up ? '✓ UP' : '✗ DOWN';
      const statusClass = info.up ? 'ok' : 'error';
      html += \`<div class="metric">
        <span class="label">\${name.toUpperCase()}</span>
        <span class="value"><span class="status \${statusClass}">\${status}</span></span>
      </div>\`;
      if (info.ms !== null) {
        html += \`<div class="metric">
          <span class="label">└ Latency</span>
          <span class="value">\${info.ms}ms</span>
        </div>\`;
      }
    }
    html += '</div>';

    // Config card
    html += '<div class="card"><h2>Configuration</h2>';
    html += \`<div class="metric">
      <span class="label">Metrics Window</span>
      <span class="value">\${Math.round(data.config.window_ms/1000/60)}min</span>
    </div>\`;
    html += \`<div class="metric">
      <span class="label">OSRM Configured</span>
      <span class="value">\${data.config.osrm_url ? 'Yes' : 'No'}</span>
    </div>\`;
    html += \`<div class="metric">
      <span class="label">Overpass Configured</span>
      <span class="value">\${data.config.overpass_url ? 'Yes' : 'No'}</span>
    </div>\`;
    html += \`<div class="metric">
      <span class="label">ORS URL Configured</span>
      <span class="value">\${data.config.ors_url ? 'Yes' : 'No'}</span>
    </div>\`;
    html += \`<div class="metric">
      <span class="label">ORS API Key</span>
      <span class="value">\${data.config.ors_api_key ? 'Yes' : 'No'}</span>
    </div>\`;
    html += '</div>';

    html += '</div>'; // End grid

    // Metrics table
    html += '<h2 style="margin: 2rem 0 1rem;">Service Metrics (RED)</h2>';
    html += '<table><thead><tr>';
    html += '<th>Service</th><th>Requests</th><th>Errors</th><th>Error Rate</th>';
    html += '<th>p50 (ms)</th><th>p95 (ms)</th><th>RPS</th>';
    html += '</tr></thead><tbody>';

    for (const [svc, m] of Object.entries(data.metrics)) {
      html += \`<tr>
        <td><strong>\${svc}</strong></td>
        <td>\${m.reqs}</td>
        <td>\${m.errors}</td>
        <td>\${(m.error_rate * 100).toFixed(2)}%</td>
        <td>\${m.p50_ms !== null ? m.p50_ms.toFixed(1) : '-'}</td>
        <td>\${m.p95_ms !== null ? m.p95_ms.toFixed(1) : '-'}</td>
        <td>\${m.rps_estimate.toFixed(3)}</td>
      </tr>\`;
    }

    html += '</tbody></table>';

    document.getElementById('content').innerHTML = html;

  } catch (err) {
    document.getElementById('content').innerHTML =
      \`<div class="error-msg">Failed to load health data: \${err.message}</div>\`;
  }
}

loadHealth();
setInterval(loadHealth, 10000); // Refresh every 10s
</script>
</body>
</html>`);
});

export default router;
