FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends miller ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY apps/worker/package.json ./
RUN npm install

COPY apps/worker/src ./src
COPY apps/worker/tsconfig.json ./tsconfig.json

ENV NODE_ENV=production
ENV PORT=8797
ENV WORKER_ARTIFACT_TTL_SECONDS=900

EXPOSE 8797

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8797) + '/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "src/index.ts"]
