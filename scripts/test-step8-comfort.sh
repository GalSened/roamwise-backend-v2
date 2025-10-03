#!/usr/bin/env bash
set -euo pipefail

echo "=== Step 8A Comfort Enrichment Test ==="
echo ""

PROXY="https://roamwise-proxy-971999716773.us-central1.run.app"

# Test 1: NEARBY mode with comfort fields
echo "--- Test 1: NEARBY mode with comfort enrichment ---"
RESP=$(curl -s -X POST "${PROXY}/planner/plan-day" \
  -H 'content-type: application/json' \
  -H 'x-lang: en' \
  -d '{
    "origin": {"lat": 32.074, "lon": 34.792},
    "date": "2025-10-05",
    "start_time_local": "09:00",
    "mode": "drive",
    "near_origin": {
      "radius_km": 5,
      "types": ["tourist_attraction"],
      "min_rating": 4.3,
      "limit": 3
    }
  }')

# Check basic response
if ! echo "$RESP" | jq -e '.ok == true' > /dev/null 2>&1; then
  echo "❌ FAIL: Response not ok"
  echo "$RESP" | jq .
  exit 1
fi

# Check timeline exists
if ! echo "$RESP" | jq -e '.plan.timeline | length > 0' > /dev/null 2>&1; then
  echo "❌ FAIL: No timeline returned"
  exit 1
fi

# Check first leg has comfort field
if ! echo "$RESP" | jq -e '.plan.timeline[0].comfort' > /dev/null 2>&1; then
  echo "❌ FAIL: First leg missing comfort field"
  exit 1
fi

# Check comfort has required fields
if ! echo "$RESP" | jq -e '.plan.timeline[0].comfort.tags | type == "array"' > /dev/null 2>&1; then
  echo "❌ FAIL: comfort.tags not an array"
  exit 1
fi

if ! echo "$RESP" | jq -e '.plan.timeline[0].comfort.uv_index != null' > /dev/null 2>&1; then
  echo "❌ FAIL: comfort.uv_index missing"
  exit 1
fi

if ! echo "$RESP" | jq -e '.plan.timeline[0].comfort.wind_kmh != null' > /dev/null 2>&1; then
  echo "❌ FAIL: comfort.wind_kmh missing"
  exit 1
fi

if ! echo "$RESP" | jq -e '.plan.timeline[0].comfort.precip_pct != null' > /dev/null 2>&1; then
  echo "❌ FAIL: comfort.precip_pct missing"
  exit 1
fi

if ! echo "$RESP" | jq -e '.plan.timeline[0].comfort.feels_c != null' > /dev/null 2>&1; then
  echo "❌ FAIL: comfort.feels_c missing"
  exit 1
fi

# Check outfit_hint exists
if ! echo "$RESP" | jq -e '.plan.timeline[0].outfit_hint | type == "string"' > /dev/null 2>&1; then
  echo "❌ FAIL: outfit_hint not a string"
  exit 1
fi

echo "✅ NEARBY mode comfort enrichment working"
echo ""

# Display sample comfort data
echo "Sample comfort data from first leg:"
echo "$RESP" | jq '.plan.timeline[0] | {comfort, outfit_hint}'
echo ""

# Test 2: A→B mode with comfort fields
echo "--- Test 2: A→B mode with comfort enrichment ---"
RESP2=$(curl -s -X POST "${PROXY}/planner/plan-day" \
  -H 'content-type: application/json' \
  -H 'x-lang: en' \
  -d '{
    "origin_query": "Tel Aviv",
    "dest": {"lat": 31.771959, "lon": 35.217018},
    "date": "2025-10-05",
    "start_time_local": "14:00",
    "mode": "drive",
    "near_origin": {
      "radius_km": 3,
      "types": ["restaurant"],
      "min_rating": 4.5,
      "limit": 2
    }
  }')

# Check basic response
if ! echo "$RESP2" | jq -e '.ok == true' > /dev/null 2>&1; then
  echo "❌ FAIL: A→B response not ok"
  echo "$RESP2" | jq .
  exit 1
fi

# Check timeline exists
if ! echo "$RESP2" | jq -e '.plan.timeline | length > 0' > /dev/null 2>&1; then
  echo "❌ FAIL: A→B no timeline returned"
  exit 1
fi

# Check last leg has comfort field (destination)
LAST_IDX=$(echo "$RESP2" | jq '.plan.timeline | length - 1')
if ! echo "$RESP2" | jq -e ".plan.timeline[$LAST_IDX].comfort" > /dev/null 2>&1; then
  echo "❌ FAIL: A→B last leg missing comfort field"
  exit 1
fi

# Check comfort tags on last leg
if ! echo "$RESP2" | jq -e ".plan.timeline[$LAST_IDX].comfort.tags | type == \"array\"" > /dev/null 2>&1; then
  echo "❌ FAIL: A→B comfort.tags not an array"
  exit 1
fi

# Check outfit_hint on last leg
if ! echo "$RESP2" | jq -e ".plan.timeline[$LAST_IDX].outfit_hint | type == \"string\"" > /dev/null 2>&1; then
  echo "❌ FAIL: A→B outfit_hint not a string"
  exit 1
fi

echo "✅ A→B mode comfort enrichment working"
echo ""

# Display sample A→B comfort data
echo "Sample A→B comfort data from last leg (destination):"
echo "$RESP2" | jq ".plan.timeline[$LAST_IDX] | {to: .to.kind, comfort, outfit_hint}"
echo ""

echo "✅ ALL TESTS PASSED: Step 8A Comfort Enrichment Complete"
echo ""
echo "Comfort fields verified:"
echo "  - comfort.tags (array)"
echo "  - comfort.uv_index (number)"
echo "  - comfort.wind_kmh (number)"
echo "  - comfort.precip_pct (number)"
echo "  - comfort.feels_c (number)"
echo "  - outfit_hint (string)"
exit 0
