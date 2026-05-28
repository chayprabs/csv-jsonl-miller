# CSVShape

CSVShape stream-processes CSV, TSV, NDJSON, and JSONL in your browser with Miller-style verb chains, joins, pivots, and dialect sniffing. The browser path currently uses DuckDB-WASM plus a TypeScript preview executor, and large files can escalate to a native worker path.

Hosted web app: `https://chayprabs.github.io/csv-jsonl-miller/`

## UI Preview

Homepage:

![CSVShape homepage](docs/qc/screenshots/home.png)

JSONL tools route:

![CSVShape JSONL tools route](docs/qc/screenshots/jsonl-tools.png)

DuckDB-WASM preview on a supported browser chain:

![CSVShape DuckDB-WASM preview](docs/qc/screenshots/duckdb-wasm-preview.png)

## Workspace

- `packages/core`: core types, execution planning, format sniffing, and shared fixtures.
- `packages/web`: Vite + React playground.
- `apps/worker`: Hono worker for large-file and native-tool execution.

## Route Entry Points

- `/`
- `/csv-filter-online/`
- `/csv-join-online/`
- `/csv-pivot-online/`
- `/jsonl-tools/`
- `/miller-online/`

## Development

```bash
pnpm install
pnpm dev
pnpm dev:worker
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm bench:browser
pnpm bench:worker
pnpm audit:lighthouse
pnpm audit:privacy
pnpm --filter @csvshape/web smoke:duckdb
pnpm --filter @csvshape/worker smoke:mlr
docker compose up --build
```

The local worker defaults to `http://localhost:8797`.

Current qualification note: Lighthouse is green, browser p95 is `377.26 ms` for 100k rows, the worker throughput gate passes, and the static app is now live on GitHub Pages. Remaining blockers are hosted worker evidence, Miller parity completion, browser Miller-WASM evidence, and final Section 21 closure.

## Release targets

- Static web bundle suitable for Cloudflare Pages.
- Containerized worker suitable for Fly.io or any OCI runtime.

## License

- Browser and shared core code: MIT. See `LICENSE`.
- Worker code: AGPL-3.0-only. See `apps/worker/LICENSE`.
