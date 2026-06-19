FROM node:20-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY functions/personalization/package.json functions/personalization/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/shared packages/shared
COPY functions/personalization functions/personalization

RUN pnpm build:shared && pnpm --filter @beaver/personalization build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/functions/personalization/dist ./functions/personalization/dist
COPY --from=builder /app/functions/personalization/package.json ./functions/personalization/package.json

WORKDIR /app/functions/personalization
EXPOSE 8080
CMD ["node", "dist/index.js"]
