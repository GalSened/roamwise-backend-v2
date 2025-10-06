#!/usr/bin/env bash
set -euo pipefail

BACKEND="${BACKEND:-https://roamwise-backend-v2-971999716773.us-central1.run.app}"

echo "=== G7A Planner Enhanced Test ==="
echo ""

# Test 1: A→B from coords + near-origin
echo "--- Test 1: A→B from coords + near-origin ---"
echo "Testing: POST $BACKEND/planner/plan-day"

out1="$(curl -s -X POST "$BACKEND/planner/plan-day" \
  -H 'content-type: application/json' \
  -H 'x-lang: he' \
  -d '{
    "origin": {"lat":32.0853,"lon":34.7818},
    "dest": {"lat":32.1093,"lon":34.8555},
    "mode":"drive",
    "near_origin": {
      "radius_km": 5,
      "types": ["tourist_attraction"],
      "min_rating": 4.3,
      "limit": 10
    }
  }')"

echo "Response:"
echo "$out1" | jq '{ok, summary: .plan.summary | {count, plan_mode, origin_source, near_origin_scanned, sar_scanned, near_origin_count}}'

# Validate response
echo "$out1" | jq -e '.ok == true' >/dev/null || { echo "❌ FAIL Test 1: ok != true"; exit 1; }
origin_source=$(echo "$out1" | jq -r '.plan.summary.origin_source')
if [ "$origin_source" != "current" ]; then
  echo "❌ FAIL Test 1: origin_source != 'current' (got: $origin_source)"
  exit 1
fi

near_origin_scanned=$(echo "$out1" | jq -r '.plan.summary.near_origin_scanned')
if [ "$near_origin_scanned" != "true" ]; then
  echo "❌ FAIL Test 1: near_origin_scanned != true"
  exit 1
fi

count=$(echo "$out1" | jq '.plan.summary.count')
if [ "$count" -lt 1 ]; then
  echo "❌ FAIL Test 1: No POIs in plan (count=$count)"
  exit 1
fi

echo "✅ PASS Test 1: A→B from coords with near-origin ($count POIs)"
echo ""

# Test 2: A→B from hotel query + SAR
echo "--- Test 2: A→B from hotel query + SAR ---"
echo "Testing: POST $BACKEND/planner/plan-day"

out2="$(curl -s -X POST "$BACKEND/planner/plan-day" \
  -H 'content-type: application/json' \
  -H 'x-lang: he' \
  -d '{
    "origin_query": "דן פנורמה תל אביב",
    "dest": {"lat":32.1093,"lon":34.8555},
    "mode":"drive",
    "near_origin": {
      "radius_km": 3,
      "types": ["tourist_attraction"],
      "min_rating": 4.0,
      "limit": 6
    },
    "sar": {
      "query": "גלידה",
      "max_detour_min": 10,
      "max_results": 8
    }
  }')"

echo "Response:"
echo "$out2" | jq '{ok, summary: .plan.summary | {count, plan_mode, origin_source, origin_name, near_origin_scanned, sar_scanned, sar_count}}'

# Validate response
echo "$out2" | jq -e '.ok == true' >/dev/null || { echo "❌ FAIL Test 2: ok != true"; exit 1; }
origin_source=$(echo "$out2" | jq -r '.plan.summary.origin_source')
if [ "$origin_source" != "hotel" ]; then
  echo "❌ FAIL Test 2: origin_source != 'hotel' (got: $origin_source)"
  exit 1
fi

sar_scanned=$(echo "$out2" | jq -r '.plan.summary.sar_scanned')
if [ "$sar_scanned" != "true" ]; then
  echo "❌ FAIL Test 2: sar_scanned != true"
  exit 1
fi

sar_count=$(echo "$out2" | jq '.plan.summary.sar_count')
if [ "$sar_count" -lt 1 ]; then
  echo "❌ FAIL Test 2: No SAR results (sar_count=$sar_count)"
  exit 1
fi

count=$(echo "$out2" | jq '.plan.summary.count')
if [ "$count" -lt 1 ]; then
  echo "❌ FAIL Test 2: No POIs in plan (count=$count)"
  exit 1
fi

origin_name=$(echo "$out2" | jq -r '.plan.summary.origin_name')
echo "✅ PASS Test 2: A→B from hotel query '$origin_name' with SAR ($count POIs, $sar_count SAR results)"
echo ""

echo "✅ ALL TESTS PASSED: G7A Planner Enhanced"
exit 0
