# QC Appendix B Report

Tool: CSVShape
Section: 21.CSVShape
Repo: https://github.com/chayprabs/csv-jsonl-miller @ cursor/csv-shape-build
Hosted: not yet deployed
Run at: 2026-05-29T00:00:00+05:30
Verifier: Codex

Counts:
  Total checks: 34
  Passed: 18
  Failed: 1
  Blocked: 15

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
- 21.18 A1 sample assertions covered by local acceptance tests.
- 21.18 A1 sample outputs are recorded in this appendix for fixture-backed evidence.
- 21.18 A2 worker escalation prompt covered by local unit tests and UI path.
- 21.12 Worker native DuckDB benchmark clears the 100M-row threshold: `1057.87 ms` for `generate_series(1, 100000000)`.
- Local Lighthouse preview scores clear the handoff gate: `performance=100`, `accessibility=100`, `best-practices=100`, and `seo=100`.

Failures:
- 21.12 Browser 100k-row p95 still misses the target: `2076.14 ms` in the production-preview run recorded at `docs/qc/benchmarks/browser-duckdb.json`, versus the required `<= 1000 ms`.

Acceptance evidence:
- Ecommerce CSV fixture aggregates to `books=42.5`, `electronics=129.99`, and `home=77.1` with one paid row per category.
- Access-log JSONL fixture jq-style query returns request `r2` for path `/cart` with duration `983`.
- Wide-form CSV fixture pivots longer to rows beginning `north/jan/120`, `north/feb/140`, `north/mar/150`, and produces 9 rows total.

Blocked:
- 21.0 Hosted URL and worker URL are not provisioned yet.
- 21.1 Browser Miller-WASM evidence is still missing.
  Browser DuckDB-WASM is now exercised by `pnpm --filter @csvshape/web smoke:duckdb`, which loads the ecommerce CSV sample, applies `filter -> stats1`, shows `Engine: DuckDB-WASM`, and captures `docs/qc/screenshots/duckdb-wasm-preview.png`.
  Worker-native DuckDB is packaged via `@duckdb/node-api`, reports `duckdbNative: true` on `/health`, and executes inline CSV/JSONL SQL plus Parquet export in local tests.
  Worker-native Miller now has a repeatable smoke run via `pnpm --filter @csvshape/worker smoke:mlr`, which returns `engine=mlr-native`, `rowCount=3`, and CSV output for the paid-order ecommerce subset in `docs/qc/benchmarks/native-mlr-smoke.json`.
- 21.12 Browser auto mode now routes simple single-source chains to the faster TypeScript preview path, and the benchmark now runs against a production preview build instead of the dev server, but the browser p95 is still above target.
- 21.13 No explicit privacy verification log yet.
- 21.14 Miller-reference parity is only partial so far.
  `packages/core/test/miller-reference.test.ts` now passes against a real local `mlr` binary for `cat`, `filter`, `put`, `cut`, `join`, `sort`, `stats1`, and `reorder`.
  Remaining verb gaps are `stats2`, `unsparsify`, `nest`, and `unnest`.
- 21.15 No hosted deployment, npm package, or worker image evidence yet.
- 21.19 Final qualification blocked on unresolved items above.

Verdict: NOT QUALIFIED
Action: continue implementation and verification until every blocked item is resolved.
