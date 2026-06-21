FROM node:20-slim
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY functions/personalization/package.json functions/personalization/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/shared packages/shared
COPY functions/personalization functions/personalization

RUN pnpm build:shared && pnpm --filter @beaver/personalization build

ENV NODE_ENV=production
WORKDIR /app/functions/personalization
EXPOSE 8080
CMD ["node", "dist/index.js"]
