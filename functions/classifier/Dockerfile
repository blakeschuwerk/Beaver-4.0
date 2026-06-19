FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY functions/classifier/package.json functions/classifier/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/shared packages/shared
COPY functions/classifier functions/classifier

RUN pnpm build:shared && pnpm --filter @beaver/classifier build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/functions/classifier/dist ./functions/classifier/dist
COPY --from=builder /app/functions/classifier/package.json ./functions/classifier/package.json

WORKDIR /app/functions/classifier
EXPOSE 8080
CMD ["node", "dist/index.js"]
