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
