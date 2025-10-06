#!/usr/bin/env bash
set -euo pipefail

BACKEND="${BACKEND:-https://roamwise-backend-v2-2t6n2rxiaa-uc.a.run.app}"

echo "=== G2 Matrix Test ==="
echo "Testing: POST $BACKEND/api/route/matrix"

out="$(curl -s -X POST "$BACKEND/api/route/matrix" \
  -H 'content-type: application/json' \
  -d '{
    "mode": "drive",
    "points": [
      {"lat": 32.0853, "lon": 34.7818},
      {"lat": 32.1093, "lon": 34.8555}
    ]
  }')"

echo "Response:"
echo "$out" | jq '.'

# Validate response
echo "$out" | jq -e '.ok == true' >/dev/null || { echo "❌ FAIL: ok != true"; exit 1; }
echo "$out" | jq -e '.n == 2' >/dev/null || { echo "❌ FAIL: n != 2"; exit 1; }
echo "$out" | jq -e '.sample | length == 2' >/dev/null || { echo "❌ FAIL: sample missing"; exit 1; }

echo "✅ PASS: G2 matrix endpoint works"
exit 0
