#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Building shared TypeScript package..."
pnpm build:shared

echo "==> Building Node functions..."
pnpm --filter @beaver/dispatcher build
pnpm --filter @beaver/classifier build
pnpm --filter @beaver/personalization build

echo "==> Python functions use Docker builds (see scripts/deploy.sh)"
echo "Build complete."
