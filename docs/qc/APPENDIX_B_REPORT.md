# QC Appendix B Report

Tool: CSVShape
Section: 21.CSVShape
Repo: https://github.com/chayprabs/csv-jsonl-miller @ main
Hosted: https://chayprabs.github.io/csv-jsonl-miller/
Run at: 2026-05-29T03:50:00+05:30
Verifier: Codex

Counts:
  Total checks: 34
  Passed: 20
  Failed: 0
  Blocked: 14

Passed:
- 21.1 Hybrid template present in repo structure.
- 21.2 Local standard checks pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- 21.3 Local Vite dev server responded `200` and local worker compose health responded `200`.
- 21.4 Multi-file input UI, worker URL fetch UI, and sample picker present.
- 21.5 Dialect sniffing, encoding detection, and manual header override present.
- 21.6 Required verbs, drag reorder, and form/raw editor modes present.
- 21.7 jq-style JSONL query flow present.
- 21.8 Pivot longer, pivot wider, explode, and group/aggregate logic present.
- 21.9 Output download controls and replayable chain script present.
- 21.10 Replay URL state encode/decode present.
- 21.11 Local screenshots captured for `/` and `/jsonl-tools/` in `docs/qc/screenshots`.
- 21.16 README includes current UI screenshots.
- 21.17 SEO sub-routes build locally via Vite multi-entry output: `/csv-filter-online/`, `/csv-join-online/`, `/csv-pivot-online/`, `/jsonl-tools/`, `/miller-online/`.
- 21.14 Miller-reference parity now passes for all 12 configured verbs, and DuckDB-WASM browser smoke now covers the acceptance samples with artifact output in `docs/qc/benchmarks/browser-duckdb-smoke.json`.
- 21.18 A1 sample assertions covered by local acceptance tests.
- 21.18 A1 sample outputs are recorded in this appendix for fixture-backed evidence.
- 21.18 A2 worker escalation prompt covered by local unit tests and UI path.
- 21.12 Worker native DuckDB benchmark clears the 100M-row threshold: `1057.87 ms` for `generate_series(1, 100000000)`.
- 21.12 Browser 100k-row p95 now clears the target: `377.26 ms` in the production-preview run recorded at `docs/qc/benchmarks/browser-duckdb.json`.
- Local Lighthouse preview scores clear the handoff gate: `performance=100`, `accessibility=100`, `best-practices=100`, and `seo=100`.

Acceptance evidence:
- Ecommerce CSV fixture aggregates to `books=42.5`, `electronics=129.99`, and `home=77.1` with one paid row per category.
- Access-log JSONL fixture jq-style query returns request `r2` for path `/cart` with duration `983`.
- Wide-form CSV fixture pivots longer to rows beginning `north/jan/120`, `north/feb/140`, `north/mar/150`, and produces 9 rows total.

Blocked:
- 21.0 Hosted web URL now exists and returned `200` at `https://chayprabs.github.io/csv-jsonl-miller/`, and the latest `main` runs for `CI`, `Deploy Pages`, and `Publish Worker Image` all succeeded on commit `8936ed5`.
  A hosted worker URL is still not provisioned, so this item remains blocked.
- 21.1 Browser Miller-WASM evidence is still missing.
  Browser DuckDB-WASM is now exercised by `pnpm --filter @csvshape/web smoke:duckdb`, which runs supported DuckDB-WASM chains over the ecommerce CSV, access-log JSONL, and wide-sales CSV samples and records the results in `docs/qc/benchmarks/browser-duckdb-smoke.json`.
  Worker-native DuckDB is packaged via `@duckdb/node-api`, reports `duckdbNative: true` on `/health`, and executes inline CSV/JSONL SQL plus Parquet export in local tests.
  Worker-native Miller now has a repeatable smoke run via `pnpm --filter @csvshape/worker smoke:mlr`, which returns `engine=mlr-native`, `rowCount=3`, and CSV output for the paid-order ecommerce subset in `docs/qc/benchmarks/native-mlr-smoke.json`.
- 21.13 Privacy evidence is now local-only rather than hosted.
  `pnpm audit:privacy` produces `docs/qc/benchmarks/browser-privacy.json`, which currently shows no worker calls, no cross-origin calls, and no browser storage writes during a standard browser-side sample transform.
  Worker `/health` and `/v1/run` responses continue to expose `artifactTtlSeconds=900` for retention handling, and worker tests now assert `Cache-Control: no-store` on those responses.
- 21.15 Hosted web deployment evidence now exists through GitHub Pages, and the worker image publish workflow is green on `main`.
  Direct GHCR package inspection is still blocked by the current token lacking `read:packages`, and npm package evidence is still missing.
- 21.19 Final qualification blocked on unresolved items above.

Verdict: NOT QUALIFIED
Action: continue implementation and verification until every blocked item is resolved.
