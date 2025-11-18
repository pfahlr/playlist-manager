# CODEX TODO — playlist-manager

Spec-first, TDD, incremental. ✅ = done. New/updated items marked **← NEW**.

## Phase 0
- ✅ 00_repo_sanity_review.yaml

## Phase 1A — Contract, DB, runtime baseline
- ✅ 01a_spec_bootstrap.yaml
- ✅ 02a_prisma_init.yaml
- ✅ 02b_raw_migrations.yaml
- ✅ 02c_prisma_seeds.yaml
- ✅ 02d_db_indexes_bench.yaml **← NEW**
- ✅ 03a_dbpkg_singleton.yaml
- ✅ 03b_db_migration_ci_gate.yaml
- ✅ 03c_token_encryption_at_rest.yaml **← NEW**
- ✅ 04a_api_validation_wiring.yaml
- ✅ 04b_openapi_warning_silencer.yaml
- ✅ 04c_api_docs_ui.yaml **← NEW**
- ✅ 04d_config_feature_flags.yaml **← NEW**

### Phase 1A.5 — Interchange
- ✅ 05a_pif_validator.yaml
- ✅ 05b_file_exporters.yaml
- ✅ 05c_importers_file.yaml

## Phase 1B — Providers (abstractions + Spotify first)
- ✅ 06a_provider_interfaces.yaml
- ✅ 06g_provider_cache_backoff.yaml **← NEW**
- ✅ 06h_provider_fixture_harness.yaml **← NEW**
- ✅ 06z_track_matching_heuristics.yaml
- ✅ 06f_provider_factory_tests.yaml
- ✅ 06b_spotify_impl.yaml

### Phase 1B.5 — Core routes (real data)
- ✅ 07a_routes_playlist_items_effective.yaml
- ✅ 07c_error_contracts.yaml
- ✅ 07b_route_exports_file.yaml
- ✅ 07d_sse_job_progress.yaml **← NEW**

## Phase 1C — Jobs & workers
- ✅ 08z_idempotency_keys.yaml
- ✅ 08a_worker_jobs_gc.yaml
- ✅ 08b_worker_export_file.yaml
- ✅ 08c_route_jobs_migrate.yaml
- ✅ 08d_worker_jobs_migrate.yaml

### Phase 1C.5 — Infrastructure gaps & remediation **← NEW**
- ✅ 08x_000_wire_token_encryption.yaml **← NEW CRITICAL**
- ✅ 08x_001_http_cache_layer.yaml **← NEW**
- ✅ 08x_002_circuit_breaker.yaml **← NEW**
- ✅ 08x_003_idempotency_redis_store.yaml **← NEW**
- ✅ 08x_004_explain_ci_integration.yaml **← NEW**

## Phase 1D — Enrichment & Gates
- ✅ 09a_ci_spec_gates.yaml
- ✅ 09b_enrichment_musicbrainz.yaml
- ✅ 09c_enrichment_wikipedia.yaml
- ✅ 09d_artist_cache_scheduler.yaml
- ✅ 09c_contract_dredd_prism.yaml
- ✅ 09d_contract_schemathesis_prism.yaml
- ✅ 09e_contract_dredd_server.yaml
- ✅ 09f_contract_schemathesis_server.yaml
- ✅ 09g_observability_min.yaml
- ✅ 09h_tests_scaffold.yaml **← NEW**
- ✅ 09k_backup_restore.yaml **← NEW**

## Phase 1E — Mobile & OAuth (+ storage)
- ✅ 10a_mobile_scaffold.yaml
- ✅ 10e_openapi_auth_completion.yaml
- ✅ 10f_env_and_secrets.yaml
- ✅ 10d_backend_oauth_callbacks.yaml
- ✅ 10m_oauth_state_nonce_csrf.yaml **← NEW**
- ✅ 10b_mobile_oauth_pkce.yaml
- ✅ 10l_session_management.yaml **← NEW**
- ✅ 10c_mobile_playlist_mvp.yaml
- ✅ 10h_deeplinks_universal_links.yaml
- ✅ 10g_ci_mobile.yaml
- ✅ 10i_security_guards.yaml
- ✅ 10j_export_artifacts.yaml
- ✅ 10k_provider_oauth_spotify_mvp.yaml

## Phase 1F — Additional providers
- ✅ 06c_deezer_impl.yaml
- ✅ 06d_tidal_impl.yaml
- ✅ 06e_youtube_impl.yaml

---

## Recommended execution order (high level)

1. **Baseline**: 02b → 02c → 02d → 03a → 03b → 03c → 04a → 04b → 04c → 04d
2. **Interchange**: 05a → 05b → 05c
3. **Providers**: 06a → 06g → 06h → 06z → 06f → 06b → 06c → 06d → 06e
4. **Routes/Jobs**: 07a → 07c → 07b → 07d → 08z → 08a → 08b → 08c → 08d
5. **Infrastructure gaps**: 08x_000 (CRITICAL) → 08x_001 → 08x_002 → 08x_003 → 08x_004 **← NEW**
6. **Enrichment & Gates**: 09a → 09b → 09c → 09d → 09c/09d/09e/09f → 09g → 09h → 09k
7. **Mobile & OAuth**: 10a → 10e → 10f → 10d → 10m → 10b → 10l → 10c → 10h → 10g → 10i → 10j → 10k

