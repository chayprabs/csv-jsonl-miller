# CSVShape

CSVShape stream-processes CSV, TSV, NDJSON, and JSONL in your browser with Miller-style verb chains, joins, pivots, and dialect sniffing. The browser path currently uses DuckDB-WASM plus a TypeScript preview executor, and large files can escalate to a native worker path.

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
pnpm --filter @csvshape/web smoke:duckdb
pnpm --filter @csvshape/worker smoke:mlr
docker compose up --build
```

The local worker defaults to `http://localhost:8797`.

Current local qualification note: Lighthouse is green and the worker throughput gate passes, but the browser 100k-row p95 is still `2076.14 ms` versus the required `<= 1000 ms`.

## Release targets

- Static web bundle suitable for Cloudflare Pages.
- Containerized worker suitable for Fly.io or any OCI runtime.

## License

- Browser and shared core code: MIT. See `LICENSE`.
- Worker code: AGPL-3.0-only. See `apps/worker/LICENSE`.
