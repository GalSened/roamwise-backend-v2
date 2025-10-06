#!/usr/bin/env bash
set -euo pipefail

BACKEND="${BACKEND:-https://roamwise-backend-v2-971999716773.us-central1.run.app}"

echo "=== G7 Planner (Plan Day) Test ==="
echo "Testing: POST $BACKEND/planner/plan-day"

out="$(curl -s -X POST "$BACKEND/planner/plan-day" \
  -H 'content-type: application/json' \
  -H 'x-lang: he' \
  -d '{
    "origin": {"lat":32.0853,"lon":34.7818},
    "dest": {"lat":32.1093,"lon":34.8555},
    "date":"2025-10-05",
    "start_time_local":"09:00",
    "end_time_local":"19:00",
    "mode":"drive",
    "places_filters": {
      "open_now": true,
      "min_rating": 4.3,
      "types":["tourist_attraction","ice_cream"]
    }
  }')"

echo "Response:"
echo "$out" | jq '{ok, summary: .plan.summary, firstLeg: .plan.timeline[0] | {from: .from.kind, to: (.to.name // .to.kind), leg_seconds}}'

# Validate response
echo "$out" | jq -e '.ok == true' >/dev/null || { echo "❌ FAIL: ok != true"; exit 1; }
count=$(echo "$out" | jq '.plan.summary.count')
if [ "$count" -lt 1 ]; then
  echo "❌ FAIL: No POIs in plan (count=$count)"
  exit 1
fi

# Validate timeline exists
timeline_len=$(echo "$out" | jq '.plan.timeline | length')
if [ "$timeline_len" -lt 2 ]; then
  echo "❌ FAIL: Timeline too short (length=$timeline_len)"
  exit 1
fi

echo "✅ PASS: G7 planner endpoint works (returned $count POIs, $timeline_len legs)"
exit 0
