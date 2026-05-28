# CSVShape

CSVShape stream-processes CSV, TSV, NDJSON, and JSONL in your browser with Miller-style verb chains, joins, pivots, and dialect sniffing. The browser path uses DuckDB-WASM and Miller-WASM; large files can escalate to a native worker path.

## Workspace

- `packages/core`: core types, execution planning, format sniffing, and shared fixtures.
- `packages/web`: Vite + React playground.
- `apps/worker`: Hono worker for large-file and native-tool execution.

## Development

```bash
pnpm install
pnpm dev
pnpm dev:worker
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose up --build
```

The local worker defaults to `http://localhost:8797`.

## Release targets

- Static web bundle suitable for Cloudflare Pages.
- Containerized worker suitable for Fly.io or any OCI runtime.

## License

- Browser and shared core code: MIT. See `LICENSE`.
- Worker code: AGPL-3.0-only. See `apps/worker/LICENSE`.
