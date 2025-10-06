#!/usr/bin/env bash
set -euo pipefail

BACKEND="${BACKEND:-https://roamwise-backend-v2-971999716773.us-central1.run.app}"

echo "=== G6 SAR (Search Along Route) Test ==="
echo "Testing: POST $BACKEND/api/poi/along-route"

out="$(curl -s -X POST "$BACKEND/api/poi/along-route" \
  -H 'content-type: application/json' \
  -H 'x-lang: he' \
  -d '{
    "query": "גלידה",
    "maxDetourMin": 15,
    "route": {
      "stops": [
        {"lat":32.0853,"lon":34.7818},
        {"lat":32.1093,"lon":34.8555}
      ],
      "mode": "drive"
    }
  }')"

echo "Response:"
echo "$out" | jq '{ok, count, first: .results[0] | {name, rating, detour_min}}'

# Validate response
echo "$out" | jq -e '.ok == true' >/dev/null || { echo "❌ FAIL: ok != true"; exit 1; }
count=$(echo "$out" | jq '.count')
if [ "$count" -lt 1 ]; then
  echo "❌ FAIL: No POIs returned (count=$count)"
  exit 1
fi

# Validate first result has detour_min
detour=$(echo "$out" | jq -e '.results[0].detour_min' 2>/dev/null || echo "null")
if [ "$detour" = "null" ]; then
  echo "❌ FAIL: First result missing detour_min"
  exit 1
fi

echo "✅ PASS: G6 SAR endpoint works (returned $count results, first detour: ${detour}min)"
exit 0
