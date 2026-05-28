FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.js ./
COPY apps/worker/package.json apps/worker/tsconfig.json ./apps/worker/

RUN corepack enable && pnpm install --filter @csvshape/worker... --frozen-lockfile=false

COPY apps/worker ./apps/worker

EXPOSE 8787

CMD ["pnpm", "--filter", "@csvshape/worker", "dev"]
