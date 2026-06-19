FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY functions/dispatcher/package.json functions/dispatcher/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/shared packages/shared
COPY functions/dispatcher functions/dispatcher

RUN pnpm build:shared && pnpm --filter @beaver/dispatcher build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/functions/dispatcher/dist ./functions/dispatcher/dist
COPY --from=builder /app/functions/dispatcher/package.json ./functions/dispatcher/package.json

WORKDIR /app/functions/dispatcher
EXPOSE 8080
CMD ["node", "dist/index.js"]
