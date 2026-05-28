# CSVShape Section 21 Status

Run date: 2026-05-29
Branch: `main`
Status source: local repo and hosted deployment verification

This file tracks the current local evidence for `RELEASE_QUALIFICATION_CHECKLIST.md` Section 21.
It is not yet a qualified release record.

## Current status

- [x] 21.1 Hybrid template exists with `packages/core`, `packages/web`, and `apps/worker`.
  Repo metadata now also includes the hosted homepage URL and 15 discovery topics, satisfying the Section 21 topics threshold.
- [x] 21.2 Standard local checks green: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
  GitHub Actions CI is also green on run `26607665312` (`eedd9b9`) after the clean-workspace typecheck fix.
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
- [x] 21.14 Per-verb Miller-reference parity now covers all 12 verbs, and DuckDB-WASM smoke runs now cover the acceptance samples via `docs/qc/benchmarks/browser-duckdb-smoke.json`.
- [x] 21.18 A1 sample outputs are asserted in local acceptance tests.
- [x] 21.18 A1 acceptance evidence is captured in `docs/qc/APPENDIX_B_REPORT.md`.
- [x] 21.18 A2 implementation path exists: files larger than 1 GB trigger worker fallback prompt.

## Still open before qualification

- [ ] 21.0 Hosted URL and worker deployment evidence.
  The static app is now hosted at `https://chayprabs.github.io/csv-jsonl-miller/`, and a direct HTTP check returned `200`.
  GitHub Actions on `main` now show green `CI`, `Deploy Pages`, and `Publish Worker Image` runs, with the latest worker image evidence coming from run `26607788767` (`8d843f4`).
  The repo now also includes a Render Blueprint in `render.yaml` plus deploy notes in `docs/deploy/RENDER_WORKER.md` for a public worker URL.
  The worker container now installs native Miller in `apps/worker/Dockerfile`, so the hosted image path aligns with the advertised native fallback engine set.
  A hosted worker URL is still missing, so this gate is not fully closed yet.
- [ ] 21.1 Real Miller-WASM, DuckDB-WASM, native Miller, and native DuckDB integration evidence.
  Browser DuckDB-WASM is exercised locally across the acceptance samples via `pnpm --filter @csvshape/web smoke:duckdb`, with artifact output in `docs/qc/benchmarks/browser-duckdb-smoke.json`.
  Worker-native DuckDB execution is covered by local tests, and worker-native Miller now has a repeatable local smoke run via `pnpm --filter @csvshape/worker smoke:mlr` with artifact output in `docs/qc/benchmarks/native-mlr-smoke.json`.
  The worker container now explicitly installs the `mlr` binary in `apps/worker/Dockerfile`, strengthening the hosted native Miller path.
  `pnpm probe:miller-wasm` now records a repeatable upstream browser probe in `docs/qc/benchmarks/browser-miller-wasm-probe.json`; the current direct `GOOS=js GOARCH=wasm` build fails inside Miller's generated parser with `function too big ... exceeds 65536 blocks`.
  Browser Miller-WASM integration evidence is still missing because that upstream build path does not currently produce a usable browser artifact.
- [ ] 21.12 Performance evidence for browser p95 and worker throughput.
  Browser 100k-row p95 now measures `377.26 ms` via the production-preview benchmark in `docs/qc/benchmarks/browser-duckdb.json`, which clears the `<= 1000 ms` gate.
  Worker native DuckDB clears the 100M-row threshold at `1057.87 ms` via `docs/qc/benchmarks/worker-duckdb.json`.
  Local Lighthouse preview scores are `performance=100`, `accessibility=100`, `best-practices=100`, and `seo=100` via `docs/qc/benchmarks/lighthouse-summary.json`.
- [ ] 21.13 Privacy proof for browser-first processing and worker retention TTL handling.
  `pnpm audit:privacy` records `docs/qc/benchmarks/browser-privacy.json` for local preview runs, and `pnpm --filter @csvshape/web privacy:smoke` now records hosted evidence in `docs/qc/benchmarks/browser-privacy-hosted.json`.
  The hosted artifact shows no worker requests, no cross-origin requests, and no IndexedDB/localStorage/sessionStorage writes during a standard browser-side sample transform.
  Worker responses and `/health` continue to document `artifactTtlSeconds=900` for native fallback paths, and the worker API enforces `Cache-Control: no-store` on `/health` and `/v1/run` responses.
  This item remains open only because the worker retention behavior is still evidenced locally rather than through a hosted worker URL.
- [ ] 21.15 Hosted deployment, npm package, and worker image evidence.
  Pages deployment is live on GitHub Pages, the worker image publish workflow is green on `main` for run `26607788767` (`8d843f4`) with a container boot-and-health smoke check plus uploaded artifact `csvshape-worker-health` (`sha256:294a8939f0412bad80cb70bf773168fb2e4cf691a1b85c480173c9fb20fc2265`), and the release workflow is green on run `26607199483` (`3239815`) with uploaded artifact `csvshape-core-pack-check`.
  `@csvshape/core` is now package-ready with `dist` exports plus a repeatable `pnpm --filter @csvshape/core pack:check` tarball build, recorded in `docs/qc/benchmarks/core-pack.json`, and the latest release workflow artifact digest is `sha256:34403cb8f9dc20469bdc7af2fb0666304bdc0b53f05e43fa7df679f2d77ca64b`.
  The worker now has repo-owned Render deployment config in `render.yaml`, but there is still no applied hosted worker instance.
  There is still no registry publication evidence from npm or GitHub Packages.
  Direct container package inspection is still blocked by the current token missing `read:packages`, and there is still no hosted worker endpoint.
- [ ] 21.19 Final all-green verdict.
