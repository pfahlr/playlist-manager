# playlist-manager

## Spec workflow

We treat `openapi.yaml` as the source of truth for the service contract. Run these commands
before proposing spec changes:

1. `pnpm lint:api` – validates the OpenAPI 3.1 document with Redocly.
2. `pnpm gen:types` – regenerates `packages/contracts/src/api.types.ts`; rerunning the command
   should yield no diff when the spec and generated file are in sync.
3. `pnpm check:breaking` – compares the working tree spec against `HEAD:openapi.yaml` with
   Optic. The command exits non-zero when it detects a breaking change so you can spot
   incompatible edits early (set `SPEC_BASE_REF` to diff against another git ref if needed).

## API docs

Run `pnpm api:dev` to boot the Fastify dev server. Once the server is listening on port 3101,
visit `http://localhost:3101/docs` for the interactive Redoc UI or download the raw OpenAPI
definition at `http://localhost:3101/openapi.yaml`.

## Database seeding

With `DATABASE_URL` pointing at a migrated Postgres instance you can load deterministic
fixtures by running `pnpm -F @app/db prisma db seed`. The script wraps the Prisma seed in a
transaction so you can safely run it multiple times; it always upserts the demo user, two
reference artists/albums, six recordings, and a `Seed Playlist` with track metadata that
contract tests rely on. Follow-up with `pnpm db:health` to confirm the database is reachable.

## Token encryption

Provider access and refresh tokens are sealed with libsodium (TweetNaCl) before hitting the
database. Generate a master key once per environment and store it as a 32 byte base64 string:

```
openssl rand -base64 32
```

Set the value in `.env` as `MASTER_KEY`. Prisma persists ciphertext in the `*_token_ciphertext`
columns, all prefixed with `pmse-v1.<keyId>.<payload>`. To rotate keys without downtime:

1. Export the new key as `MASTER_KEY` and the previous key as `MASTER_KEY_PREVIOUS`.
2. Run a dry-run to inspect how many rows will be touched:
   ```
   pnpm tsx scripts/rotate-token-key.ts --dry-run
   ```
3. Re-run without `--dry-run` to apply the rotation; the script is idempotent and skips rows
   already sealed with the new key.

## Backups

The project includes scripts for creating and restoring database backups with configurable retention
policies and optional S3 sync.

### Creating backups

Run `scripts/backup.sh` to create a compressed database dump:

```bash
bash scripts/backup.sh
```

The script will:
- Create a timestamped backup file in `backups/` directory (e.g., `playlist_manager_20240101_120000.sql.gz`)
- Apply retention policy (default: 30 days) and delete old backups
- Optionally sync to S3 if configured

### Restoring from backup

Run `scripts/restore.sh` with the backup file path:

```bash
bash scripts/restore.sh backups/playlist_manager_20240101_120000.sql.gz
```

The script will:
- Prompt for confirmation (set `SKIP_CONFIRMATION=true` to skip in automation)
- Test database connectivity
- Restore the backup using `gunzip | psql`
- Verify the restore by checking table count

### Configuration

Both scripts use environment variables for configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/playlistmgr?schema=public` |
| `BACKUP_DIR` | Directory for backup files | `$PROJECT_ROOT/backups` |
| `BACKUP_RETENTION_DAYS` | Days to keep old backups | `30` |
| `DRY_RUN` | Preview mode without making changes | `false` |
| `S3_BUCKET` | S3 bucket for remote backup storage (optional) | (not set) |
| `AWS_REGION` | AWS region for S3 bucket | `us-east-1` |
| `SKIP_CONFIRMATION` | Skip restore confirmation prompt (restore only) | `false` |

### S3 sync (optional)

To enable automatic S3 sync for backups:

1. Configure AWS credentials using environment variables or AWS CLI
2. Set `S3_BUCKET` environment variable to your bucket name
3. Run backup script - it will automatically sync to `s3://$S3_BUCKET/backups/`

```bash
export S3_BUCKET=my-backups
export AWS_REGION=us-west-2
bash scripts/backup.sh
```

### Retention strategy

The backup script implements a simple time-based retention policy:

- Backups older than `BACKUP_RETENTION_DAYS` (default: 30 days) are automatically deleted
- Both local and S3 backups follow the same retention policy
- Use `DRY_RUN=true` to preview which backups would be deleted

### Dry run mode

Test backup or restore operations without making changes:

```bash
# Preview backup without creating files
DRY_RUN=true bash scripts/backup.sh

# Preview restore without modifying database
DRY_RUN=true bash scripts/restore.sh backups/playlist_manager_20240101_120000.sql.gz
```

### Backup schedule

For production environments, schedule backups using cron or your orchestration platform:

```cron
# Daily backup at 2:00 AM
0 2 * * * cd /path/to/playlist-manager && bash scripts/backup.sh
```

## Performance regression testing

The project includes EXPLAIN-based performance regression checks to ensure critical queries use
appropriate indexes. These checks run automatically in CI after database migrations and seeding.

### Running EXPLAIN checks locally

After migrating and seeding your database, run:

```bash
bash scripts/run-explain-checks.sh
```

The script validates that all queries in `scripts/explain/*.sql` are using index scans rather
than sequential scans. It parses `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` output and fails if:

- Any query performs a sequential scan on a table
- Index usage cannot be verified from the query plan

### EXPLAIN scripts

Current performance checks:

- **playlists.sql**: Verifies playlist lookups by user use `playlist_user_scope_idx`
- **items.sql**: Verifies playlist item queries use `playlist_item_recording_id_idx`
- **fuzzy_search.sql**: Verifies trigram fuzzy search on artist/title uses GIN indexes

### Adding new EXPLAIN checks

To add a new performance regression test:

1. Create a new `.sql` file in `scripts/explain/` with your query
2. Use `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` format for parseable output
3. Ensure the query runs against seeded data (see "Database seeding" above)
4. Run `bash scripts/run-explain-checks.sh` locally to validate

The CI workflow will automatically pick up new scripts and validate them on every PR.
