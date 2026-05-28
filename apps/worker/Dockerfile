FROM node:22-alpine

WORKDIR /app

COPY apps/worker/package.json ./
RUN npm install

COPY apps/worker/src ./src
COPY apps/worker/tsconfig.json ./tsconfig.json

EXPOSE 8797

CMD ["npx", "tsx", "src/index.ts"]
