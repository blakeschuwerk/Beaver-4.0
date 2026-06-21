FROM node:20-slim
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY functions/dispatcher/package.json functions/dispatcher/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/shared packages/shared
COPY functions/dispatcher functions/dispatcher

RUN pnpm build:shared && pnpm --filter @beaver/dispatcher build

ENV NODE_ENV=production
WORKDIR /app/functions/dispatcher
EXPOSE 8080
CMD ["node", "dist/index.js"]
