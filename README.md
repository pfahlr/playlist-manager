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

## Database seeding

With `DATABASE_URL` pointing at a migrated Postgres instance you can load deterministic
fixtures by running `pnpm -F @app/db prisma db seed`. The script wraps the Prisma seed in a
transaction so you can safely run it multiple times; it always upserts the demo user, two
reference artists/albums, six recordings, and a `Seed Playlist` with track metadata that
contract tests rely on. Follow-up with `pnpm db:health` to confirm the database is reachable.
