#!/usr/bin/env bash
set -euo pipefail

BACKEND="${BACKEND:-https://roamwise-backend-v2-2t6n2rxiaa-uc.a.run.app}"

echo "=== API Route Test ==="
echo "Testing: POST $BACKEND/api/route"

out="$(curl -s -X POST "$BACKEND/api/route" \
  -H 'content-type: application/json' \
  -d '{
    "origin": {"lat": 32.0853, "lon": 34.7818},
    "destination": {"lat": 32.1093, "lon": 34.8555},
    "mode": "drive"
  }')"

echo "Response:"
echo "$out" | jq '.'

# Validate response
echo "$out" | jq -e '.ok == true' >/dev/null || { echo "❌ FAIL: ok != true"; exit 1; }
echo "$out" | jq -e '.route | length > 0' >/dev/null || { echo "❌ FAIL: route missing or empty"; exit 1; }
echo "$out" | jq -e '.distance' >/dev/null || { echo "❌ FAIL: distance missing"; exit 1; }
echo "$out" | jq -e '.duration' >/dev/null || { echo "❌ FAIL: duration missing"; exit 1; }

echo "✅ PASS: API route endpoint works"
exit 0
