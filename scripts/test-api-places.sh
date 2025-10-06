#!/usr/bin/env bash
set -euo pipefail

BACKEND="${BACKEND:-https://roamwise-backend-v2-2t6n2rxiaa-uc.a.run.app}"

echo "=== G3 Places Test ==="
echo "Testing: POST $BACKEND/api/places/search"

out="$(curl -s -X POST "$BACKEND/api/places/search" \
  -H 'content-type: application/json' \
  -H 'x-lang: he' \
  -d '{
    "query": "גלידה",
    "openNow": true,
    "minRating": 4.3,
    "bias": {
      "center": {"latitude": 32.0853, "longitude": 34.7818},
      "radius": 5000
    }
  }')"

echo "Response:"
echo "$out" | jq '{ok, count: (.items|length), first: .items[0].displayName.text}'

# Validate response
echo "$out" | jq -e '.ok == true' >/dev/null || { echo "❌ FAIL: ok != true"; exit 1; }
count=$(echo "$out" | jq '.items | length')
if [ "$count" -lt 1 ]; then
  echo "❌ FAIL: No places returned (count=$count)"
  exit 1
fi

echo "✅ PASS: G3 places endpoint works (returned $count results)"
exit 0
