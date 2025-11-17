#!/usr/bin/env bash
set -euo pipefail

# Restore script for Playlist Manager
# Restores database dumps from backup files

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration from environment variables
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/playlistmgr?schema=public}"
BACKUP_FILE="${1:-}"
DRY_RUN="${DRY_RUN:-false}"
SKIP_CONFIRMATION="${SKIP_CONFIRMATION:-false}"

# Show usage
usage() {
  cat <<EOF
Usage: $0 <backup-file>

Restore database from a backup file.

Arguments:
  <backup-file>    Path to the backup file (.sql.gz)

Environment Variables:
  DATABASE_URL           Database connection string (required)
  DRY_RUN                Set to 'true' to preview without restoring (default: false)
  SKIP_CONFIRMATION      Set to 'true' to skip confirmation prompt (default: false)

Examples:
  # Restore from a backup file
  $0 backups/playlist_manager_20240101_120000.sql.gz

  # Dry run to preview
  DRY_RUN=true $0 backups/playlist_manager_20240101_120000.sql.gz

  # Skip confirmation in automation
  SKIP_CONFIRMATION=true $0 backups/playlist_manager_20240101_120000.sql.gz
EOF
  exit 1
}

# Validate arguments
if [ -z "$BACKUP_FILE" ]; then
  echo -e "${RED}✗ Error: Backup file not specified${NC}"
  echo ""
  usage
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}✗ Error: Backup file not found: $BACKUP_FILE${NC}"
  exit 1
fi

# Extract database connection details from DATABASE_URL
# Format: postgresql://user:pass@host:port/dbname?schema=public
if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([0-9]+)/([^\?]+) ]]; then
  PGUSER="${BASH_REMATCH[1]}"
  PGPASSWORD="${BASH_REMATCH[2]}"
  PGHOST="${BASH_REMATCH[3]}"
  PGPORT="${BASH_REMATCH[4]}"
  PGDATABASE="${BASH_REMATCH[5]}"
else
  echo -e "${RED}✗ Failed to parse DATABASE_URL${NC}"
  exit 1
fi

# Export environment variables for psql
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Playlist Manager Restore"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Database: $PGDATABASE@$PGHOST:$PGPORT"
echo "Backup file: $BACKUP_FILE"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup size: $BACKUP_SIZE"
echo "Dry run: $DRY_RUN"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "${YELLOW}⚠ DRY RUN MODE - No changes will be made${NC}"
  echo ""
fi

# Warning and confirmation
if [ "$DRY_RUN" = "false" ] && [ "$SKIP_CONFIRMATION" = "false" ]; then
  echo -e "${YELLOW}⚠ WARNING: This will REPLACE all data in the database${NC}"
  echo -e "${YELLOW}           Database: $PGDATABASE@$PGHOST:$PGPORT${NC}"
  echo ""
  read -p "Are you sure you want to continue? (yes/no): " -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Restore cancelled."
    exit 0
  fi
fi

# Test database connection
echo "Testing database connection..."
if [ "$DRY_RUN" = "false" ]; then
  if ! psql -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}✗ Database connection failed${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Database connection successful${NC}"
else
  echo -e "${YELLOW}[DRY RUN] Would test connection to: $PGDATABASE@$PGHOST:$PGPORT${NC}"
fi

# Restore database
echo ""
echo "Restoring database from backup..."
if [ "$DRY_RUN" = "false" ]; then
  # The backup was created with pg_dump --clean --if-exists, so we can pipe directly to psql
  if gunzip -c "$BACKUP_FILE" | psql > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database restored successfully${NC}"
  else
    echo -e "${RED}✗ Database restore failed${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}[DRY RUN] Would restore from: $BACKUP_FILE${NC}"
  echo -e "${YELLOW}[DRY RUN] Target database: $PGDATABASE@$PGHOST:$PGPORT${NC}"
fi

# Verify restore (basic sanity check)
if [ "$DRY_RUN" = "false" ]; then
  echo ""
  echo "Verifying restore..."

  # Count tables
  TABLE_COUNT=$(psql -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | xargs)

  if [ "$TABLE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Restore verified: $TABLE_COUNT tables found${NC}"
  else
    echo -e "${YELLOW}⚠ Warning: No tables found in database${NC}"
  fi
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Restore Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
if [ "$DRY_RUN" = "false" ]; then
  echo -e "${GREEN}✓ Restore completed successfully${NC}"
  echo "  Source: $BACKUP_FILE"
  echo "  Target: $PGDATABASE@$PGHOST:$PGPORT"
  if [ -n "${TABLE_COUNT:-}" ]; then
    echo "  Tables: $TABLE_COUNT"
  fi
else
  echo -e "${YELLOW}⚠ Dry run completed - no changes made${NC}"
  echo "  Would restore: $BACKUP_FILE"
  echo "  To database: $PGDATABASE@$PGHOST:$PGPORT"
fi
echo ""

exit 0
