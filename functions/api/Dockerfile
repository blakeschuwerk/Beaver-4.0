FROM node:20-slim
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY functions/classifier/package.json functions/classifier/
COPY functions/personalization/package.json functions/personalization/
COPY functions/api/package.json functions/api/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/shared packages/shared
COPY functions/classifier functions/classifier
COPY functions/personalization functions/personalization
COPY functions/api functions/api

RUN pnpm build:shared \
  && pnpm --filter @beaver/classifier build \
  && pnpm --filter @beaver/personalization build \
  && pnpm --filter @beaver/api build

ENV NODE_ENV=production
WORKDIR /app/functions/api
EXPOSE 8080
CMD ["node", "dist/index.js"]
