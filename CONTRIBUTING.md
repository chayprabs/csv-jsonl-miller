# Contributing

## Setup

1. Install Node 22+ and pnpm 10+.
2. Run `pnpm install`.
3. Start the web app with `pnpm dev`.
4. Start the worker with `pnpm dev:worker` or `docker compose up --build`.

## Expectations

- Use conventional commits.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before opening a PR.
- Keep browser-side file processing local unless the worker path is explicitly selected.
