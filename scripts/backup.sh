#!/usr/bin/env bash
set -euo pipefail

# Backup script for Playlist Manager
# Creates database dumps and syncs artifacts to S3 (or local storage)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration from environment variables
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/playlistmgr?schema=public}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DRY_RUN="${DRY_RUN:-false}"
S3_BUCKET="${S3_BUCKET:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"

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

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate timestamp for backup filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/playlist_manager_${TIMESTAMP}.sql.gz"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Playlist Manager Backup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Database: $PGDATABASE@$PGHOST:$PGPORT"
echo "Backup file: $BACKUP_FILE"
echo "Retention: $BACKUP_RETENTION_DAYS days"
echo "Dry run: $DRY_RUN"
echo ""

if [ "$DRY_RUN" = "true" ]; then
  echo -e "${YELLOW}⚠ DRY RUN MODE - No changes will be made${NC}"
  echo ""
fi

# Export environment variables for pg_dump
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

# Create database backup
echo "Creating database backup..."
if [ "$DRY_RUN" = "false" ]; then
  if pg_dump --no-owner --no-acl --clean --if-exists | gzip > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✓ Database backup created: $BACKUP_SIZE${NC}"
  else
    echo -e "${RED}✗ Database backup failed${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}[DRY RUN] Would create: $BACKUP_FILE${NC}"
fi

# Clean up old backups (retention policy)
echo ""
echo "Applying retention policy (keeping last $BACKUP_RETENTION_DAYS days)..."
if [ "$DRY_RUN" = "false" ]; then
  OLD_BACKUPS=$(find "$BACKUP_DIR" -name "playlist_manager_*.sql.gz" -type f -mtime +$BACKUP_RETENTION_DAYS)
  if [ -n "$OLD_BACKUPS" ]; then
    echo "$OLD_BACKUPS" | while read -r old_backup; do
      echo "  Deleting: $(basename "$old_backup")"
      rm "$old_backup"
    done
    echo -e "${GREEN}✓ Old backups removed${NC}"
  else
    echo "  No old backups to remove"
  fi
else
  OLD_BACKUPS=$(find "$BACKUP_DIR" -name "playlist_manager_*.sql.gz" -type f -mtime +$BACKUP_RETENTION_DAYS 2>/dev/null || true)
  if [ -n "$OLD_BACKUPS" ]; then
    echo -e "${YELLOW}[DRY RUN] Would delete:${NC}"
    echo "$OLD_BACKUPS" | while read -r old_backup; do
      echo "  - $(basename "$old_backup")"
    done
  else
    echo -e "${YELLOW}[DRY RUN] No old backups to remove${NC}"
  fi
fi

# Sync to S3 if configured
if [ -n "$S3_BUCKET" ]; then
  echo ""
  echo "Syncing to S3: s3://$S3_BUCKET/backups/"
  if command -v aws &> /dev/null; then
    if [ "$DRY_RUN" = "false" ]; then
      if aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/backups/" --region "$AWS_REGION"; then
        echo -e "${GREEN}✓ Backup synced to S3${NC}"
      else
        echo -e "${RED}✗ S3 sync failed${NC}"
        exit 1
      fi
    else
      echo -e "${YELLOW}[DRY RUN] Would sync: $BACKUP_FILE → s3://$S3_BUCKET/backups/${NC}"
    fi
  else
    echo -e "${YELLOW}⚠ AWS CLI not found, skipping S3 sync${NC}"
  fi
else
  echo ""
  echo "S3_BUCKET not configured, backup stored locally only"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backup Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
if [ "$DRY_RUN" = "false" ]; then
  echo -e "${GREEN}✓ Backup completed successfully${NC}"
  echo "  Location: $BACKUP_FILE"
  echo "  Size: $BACKUP_SIZE"
  if [ -n "$S3_BUCKET" ]; then
    echo "  S3: s3://$S3_BUCKET/backups/$(basename "$BACKUP_FILE")"
  fi
else
  echo -e "${YELLOW}⚠ Dry run completed - no changes made${NC}"
fi
echo ""

# List recent backups
echo "Recent backups:"
ls -lh "$BACKUP_DIR"/playlist_manager_*.sql.gz 2>/dev/null | tail -5 | awk '{print "  " $9 " (" $5 ")"}'
echo ""

exit 0
