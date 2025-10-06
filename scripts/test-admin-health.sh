#!/usr/bin/env bash
set -euo pipefail

BACKEND="${BACKEND:-https://roamwise-backend-v2-2t6n2rxiaa-uc.a.run.app}"

echo "=== Admin Health Test ==="
echo "Testing: GET $BACKEND/admin/healthz"

out="$(curl -s -X GET "$BACKEND/admin/healthz")"

echo "Response:"
echo "$out" | jq '.'

# Validate response structure
echo "$out" | jq -e '.ok == true' >/dev/null || { echo "❌ FAIL: ok != true"; exit 1; }
echo "$out" | jq -e '.timestamp' >/dev/null || { echo "❌ FAIL: timestamp missing"; exit 1; }
echo "$out" | jq -e '.uptime' >/dev/null || { echo "❌ FAIL: uptime missing"; exit 1; }

# Enhanced metrics (optional - don't fail if missing, just warn)
if ! echo "$out" | jq -e '.route_relaxed_count' >/dev/null 2>&1; then
  echo "⚠️  WARNING: route_relaxed_count not present (enhancement pending)"
fi

if ! echo "$out" | jq -e '.provider_mix' >/dev/null 2>&1; then
  echo "⚠️  WARNING: provider_mix not present (enhancement pending)"
fi

if ! echo "$out" | jq -e '.timing_histograms' >/dev/null 2>&1; then
  echo "⚠️  WARNING: timing_histograms not present (enhancement pending)"
fi

echo "✅ PASS: Admin healthz endpoint responds"
exit 0
