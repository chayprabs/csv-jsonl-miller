# QC Appendix B Report

Tool: CSVShape
Section: 21.CSVShape
Repo: https://github.com/chayprabs/csv-jsonl-miller @ cursor/csv-shape-build
Hosted: not yet deployed
Run at: 2026-05-29T00:00:00+05:30
Verifier: Codex

Counts:
  Total checks: 34
  Passed: 17
  Failed: 0
  Blocked: 17

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

Acceptance evidence:
- Ecommerce CSV fixture aggregates to `books=42.5`, `electronics=129.99`, and `home=77.1` with one paid row per category.
- Access-log JSONL fixture jq-style query returns request `r2` for path `/cart` with duration `983`.
- Wide-form CSV fixture pivots longer to rows beginning `north/jan/120`, `north/feb/140`, `north/mar/150`, and produces 9 rows total.

Blocked:
- 21.0 Hosted URL and worker URL are not provisioned yet.
- 21.1 Browser DuckDB-WASM and Miller integration evidence is still missing, and native Miller is still absent.
  Worker-native DuckDB is now packaged via `@duckdb/node-api`, reports `duckdbNative: true` on `/health`, and executes inline CSV/JSONL SQL plus Parquet export in local tests.
- 21.12 No Lighthouse run or perf measurements yet.
- 21.13 No explicit privacy verification log yet.
- 21.14 No Miller-reference parity suite yet.
- 21.15 No hosted deployment, npm package, or worker image evidence yet.
- 21.19 Final qualification blocked on unresolved items above.

Verdict: NOT QUALIFIED
Action: continue implementation and verification until every blocked item is resolved.
