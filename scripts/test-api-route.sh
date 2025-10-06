#!/usr/bin/env bash
set -euo pipefail

BACKEND="${BACKEND:-https://roamwise-backend-v2-2t6n2rxiaa-uc.a.run.app}"

echo "=== API Route Test ==="
echo "Testing: POST $BACKEND/api/route"

out="$(curl -s -X POST "$BACKEND/api/route" \
  -H 'content-type: application/json' \
  -d '{
    "stops": [
      {"lat": 32.0853, "lon": 34.7818},
      {"lat": 32.1093, "lon": 34.8555}
    ],
    "mode": "drive"
  }')"

echo "Response:"
echo "$out" | jq '.'

# Validate response
echo "$out" | jq -e '.ok == true' >/dev/null || { echo "❌ FAIL: ok != true"; exit 1; }
echo "$out" | jq -e '.distance_m' >/dev/null || { echo "❌ FAIL: distance_m missing"; exit 1; }
echo "$out" | jq -e '.duration_s' >/dev/null || { echo "❌ FAIL: duration_s missing"; exit 1; }
echo "$out" | jq -e '.geometry' >/dev/null || { echo "❌ FAIL: geometry missing"; exit 1; }

echo "✅ PASS: API route endpoint works"
exit 0
