#!/usr/bin/env bash
set -euo pipefail

# EXPLAIN performance regression checker
# Runs all EXPLAIN scripts and validates that indexes are being used

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPLAIN_DIR="$SCRIPT_DIR/explain"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check DATABASE_URL is set
if [ -z "${DATABASE_URL:-}" ]; then
  echo -e "${RED}✗ DATABASE_URL environment variable is required${NC}"
  exit 1
fi

# Check psql is available
if ! command -v psql &> /dev/null; then
  echo -e "${RED}✗ psql command not found${NC}"
  exit 1
fi

# Array to track results
declare -a PASSED_QUERIES=()
declare -a FAILED_QUERIES=()

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  EXPLAIN Performance Regression Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Function to extract and validate plan nodes from JSON output
check_plan_uses_indexes() {
  local json_output="$1"
  local query_name="$2"

  # Extract all "Node Type" values from the plan
  local node_types
  node_types=$(echo "$json_output" | jq -r '
    .. |
    if type == "object" and has("Node Type") then
      ."Node Type"
    else
      empty
    end
  ' 2>/dev/null || echo "")

  if [ -z "$node_types" ]; then
    echo -e "${RED}✗ Failed to parse JSON output for: $query_name${NC}"
    FAILED_QUERIES+=("$query_name (parse error)")
    return 1
  fi

  # Check if any node is a Seq Scan (bad for performance)
  if echo "$node_types" | grep -q "^Seq Scan$"; then
    # Get the relation name being scanned
    local seq_scan_table
    seq_scan_table=$(echo "$json_output" | jq -r '
      .. |
      if type == "object" and ."Node Type" == "Seq Scan" then
        .["Relation Name"] // "unknown"
      else
        empty
      end
    ' | head -1)

    echo -e "${RED}✗ Sequential scan detected on table: $seq_scan_table${NC}"
    echo "  Query: $query_name"
    FAILED_QUERIES+=("$query_name (Seq Scan on $seq_scan_table)")
    return 1
  fi

  # Check if we have index usage (Index Scan, Index Only Scan, or Bitmap Index Scan)
  if echo "$node_types" | grep -qE "Index Scan|Index Only Scan|Bitmap Index Scan|Bitmap Heap Scan"; then
    local index_name
    index_name=$(echo "$json_output" | jq -r '
      .. |
      if type == "object" and (."Node Type" | test("Index")) then
        .["Index Name"] // "unnamed index"
      else
        empty
      end
    ' | head -1)

    echo -e "${GREEN}✓ Using index: $index_name${NC}"
    echo "  Query: $query_name"
    PASSED_QUERIES+=("$query_name")
    return 0
  fi

  # If we get here, no indexes found (might be OK for small tables, but log warning)
  echo -e "${YELLOW}⚠ No index scan found (may use other optimization)${NC}"
  echo "  Query: $query_name"
  echo "  Node types: $(echo "$node_types" | tr '\n' ', ')"
  PASSED_QUERIES+=("$query_name (no index)")
  return 0
}

# Process each EXPLAIN script
for sql_file in "$EXPLAIN_DIR"/*.sql; do
  if [ ! -f "$sql_file" ]; then
    continue
  fi

  filename=$(basename "$sql_file")
  echo ""
  echo "Running: $filename"
  echo "────────────────────────────────────────────────"

  # Run the SQL file and capture output
  output=$(psql "$DATABASE_URL" -f "$sql_file" -t -A 2>&1) || {
    echo -e "${RED}✗ Failed to execute $filename${NC}"
    echo "$output"
    FAILED_QUERIES+=("$filename (execution error)")
    continue
  }

  # Split output by lines that start with "EXPLAIN" header
  # Each query produces a JSON array on separate lines
  query_num=1
  while IFS= read -r line; do
    # Skip empty lines and echo output
    if [ -z "$line" ] || [[ "$line" == EXPLAIN* ]]; then
      continue
    fi

    # Check if this looks like JSON (starts with [)
    if [[ "$line" == "["* ]]; then
      check_plan_uses_indexes "$line" "$filename (query $query_num)"
      ((query_num++))
    fi
  done <<< "$output"

done

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}Passed: ${#PASSED_QUERIES[@]}${NC}"
for query in "${PASSED_QUERIES[@]}"; do
  echo "  ✓ $query"
done

if [ ${#FAILED_QUERIES[@]} -gt 0 ]; then
  echo ""
  echo -e "${RED}Failed: ${#FAILED_QUERIES[@]}${NC}"
  for query in "${FAILED_QUERIES[@]}"; do
    echo "  ✗ $query"
  done
  echo ""
  echo -e "${RED}EXPLAIN checks failed!${NC}"
  echo "Sequential scans detected - indexes may be missing or queries need optimization."
  exit 1
fi

echo ""
echo -e "${GREEN}✓ All EXPLAIN checks passed!${NC}"
echo "All queries are using indexes appropriately."
exit 0
