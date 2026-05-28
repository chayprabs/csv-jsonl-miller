# CSVShape Section 21 Status

Run date: 2026-05-29
Branch: `cursor/csv-shape-build`
Status source: local repo verification

This file tracks the current local evidence for `RELEASE_QUALIFICATION_CHECKLIST.md` Section 21.
It is not yet a qualified release record.

## Current status

- [x] 21.1 Hybrid template exists with `packages/core`, `packages/web`, and `apps/worker`.
- [x] 21.2 Standard local checks green: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- [x] 21.3 Local Vite and `docker compose up --build worker` both returned `200` on local health checks.
- [x] 21.4 Multi-file drag-drop, samples, and worker URL fetch UI exist.
- [x] 21.5 Dialect sniffing, encoding detection, and header override exist with unit coverage.
- [x] 21.6 Required verb palette exists and browser preview executes the configured chain.
- [x] 21.7 JSONL jq-style query flow exists in browser preview.
- [x] 21.8 Pivot longer, pivot wider, explode, and grouped stats exist in browser preview.
- [x] 21.9 Output downloads and replayable chain script exist.
- [x] 21.10 Replay URL state encode/decode exists.
- [x] 21.11 Local browser screenshots captured for `/` and `/jsonl-tools/`.
- [x] 21.16 README now includes local UI screenshots.
- [x] 21.17 SEO sub-routes build locally: `/csv-filter-online/`, `/csv-join-online/`, `/csv-pivot-online/`, `/jsonl-tools/`, `/miller-online/`.
- [x] 21.18 A1 sample outputs are asserted in local acceptance tests.
- [x] 21.18 A1 acceptance evidence is captured in `docs/qc/APPENDIX_B_REPORT.md`.
- [x] 21.18 A2 implementation path exists: files larger than 1 GB trigger worker fallback prompt.

## Still open before qualification

- [ ] 21.0 Hosted URL and worker deployment evidence.
- [ ] 21.1 Real Miller-WASM, DuckDB-WASM, native Miller, and native DuckDB integration evidence.
  Browser DuckDB-WASM is exercised locally via `pnpm --filter @csvshape/web smoke:duckdb`.
  Worker-native DuckDB execution is covered by local tests, and worker-native Miller now has a repeatable local smoke run via `pnpm --filter @csvshape/worker smoke:mlr` with artifact output in `docs/qc/benchmarks/native-mlr-smoke.json`.
  Browser Miller-WASM evidence and per-verb Miller parity evidence are still missing.
- [ ] 21.12 Performance evidence for browser p95 and worker throughput.
  Browser 100k-row p95 currently measures `2076.14 ms` via the production-preview benchmark in `docs/qc/benchmarks/browser-duckdb.json`, which still misses the `<= 1000 ms` gate.
  Worker native DuckDB clears the 100M-row threshold at `1057.87 ms` via `docs/qc/benchmarks/worker-duckdb.json`.
  Local Lighthouse preview scores are `performance=100`, `accessibility=100`, `best-practices=100`, and `seo=100` via `docs/qc/benchmarks/lighthouse-summary.json`.
- [ ] 21.13 Privacy proof for browser-first processing and worker retention TTL handling.
  `pnpm audit:privacy` now records `docs/qc/benchmarks/browser-privacy.json`, showing no worker requests, no cross-origin requests, and no IndexedDB/localStorage/sessionStorage writes during a normal browser-side sample transform.
  Worker responses and `/health` continue to document `artifactTtlSeconds=900` for native fallback paths.
- [ ] 21.14 Full per-verb correctness vs Miller reference.
  `packages/core/test/miller-reference.test.ts` now verifies `cat`, `filter`, `put`, `cut`, `join`, `sort`, `stats1`, `reorder`, and `unsparsify` against a real local `mlr` binary when available.
  Remaining parity gaps are `stats2`, `nest`, and `unnest`.
- [ ] 21.15 Hosted deployment, npm package, and worker image evidence.
- [ ] 21.19 Final all-green verdict.
