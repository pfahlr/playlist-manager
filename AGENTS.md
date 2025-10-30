# AGENTS.md — playlist-manager

This repository is **Spec-as-Source-of-Truth** (ADR-005). All work is **TDD-first**:
write failing tests → implement minimum to pass → refactor → docs. No feature merges
without green tests and spec alignment.

## Roles

- **SPEC Agent** – Owns `openapi.yaml`, `/schemas/**` (PIF + CSV). Runs spec lint, breaking-change diff, and regenerates client types.
- **DB Agent** – Owns Prisma models & migrations. Raw SQL allowed (partial indexes, triggers, views). Guarantees reproducible `migrate deploy`.
- **API Agent** – Wires request/response validation to **OpenAPI 3.1**. Implements handlers matching the spec.
- **PROVIDER Agent(s)** – Implement `Importer`/`Exporter` contracts for Spotify/Deezer/TIDAL/YouTube. All HTTP calls are mocked in tests.
- **WORKER Agent** – BullMQ jobs (migrate/export; snapshot GC). Durable retries; idempotent ops.
- **QA Agent** – Contract tests (Schemathesis/Dredd), golden outputs for exporters, fixtures.

## Non-negotiables

- **Spec first**: No route, shape, or field without an OpenAPI/JSON Schema change.
- **TDD**: Tests created/updated *before* code. Each task defines its acceptance tests path.
- **Determinism**: No network in unit tests. Use fixtures and mocks (nock/msw/prism).
- **Safety**: Provider tokens never leave server; encrypt at rest.

## Monorepo commands

```bash
# API spec
pnpm lint:api
pnpm gen:types
pnpm check:breaking

# Prisma / DB
pnpm prisma:generate
pnpm prisma:migrate:dev     # local only
pnpm prisma:migrate:deploy  # CI/prod
pnpm prisma:studio

# Mock server for FE parallelization
pnpm mock:api

# Health
pnpm db:health

