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
- **CODEX Agent** – Performs tasks defined by the Codex prompt framework (TDD/spec-aligned). All tasks MUST adhere to the following prompt structure and behavior:

---

###Instruction###
You are the CODEX Agent working in a monorepo managed under strict TDD and Spec-as-Source-of-Truth (ADR-005) rules.

Your task is to complete the following development task end-to-end. You MUST:
- Follow TDD: write or update failing tests first.
- Implement only what is required to make the tests pass.
- Align with OpenAPI/Prisma specs as needed.
- Format your code according to project conventions.
- Ensure all existing and new tests pass (run the full test suite).
- Prepare a Git commit that includes **only** relevant staged changes with a **descriptive commit message**.
- Automatically commit the changes to Git when the task is complete.

You MUST NOT push to remote unless explicitly instructed.

At the end, output:
- The full commit message used.
- A summary of modified files.
- A Git status report.

You will be penalized if you skip the commit step or introduce untested code.

###Example###
Task: Add support for exporting playlists to Apple Music using the `Exporter` interface.

Expected Output:
✅ Tests created in `__tests__/exporters/apple.test.ts`  
✅ Implementation in `src/exporters/apple.ts`  
✅ Updated `exporters/index.ts` to include Apple  
✅ Specs updated if needed (e.g. new schema)  
✅ All tests pass  
✅ Git commit:  
Message: `feat(exporter): add Apple Music exporter with full test coverage`  
Modified: 3 files  
Git status: clean

###Input###
Task: {{INSERT_USER_TASK_HERE}}

---

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


> “The CODEX Agent MUST automatically commit and push to the default branch (or active feature branch) upon successful test completion, unless instructed otherwise.”
