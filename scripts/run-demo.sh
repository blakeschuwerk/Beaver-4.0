#!/usr/bin/env bash
# Single command to see the app working: ensures the local Qwen model is up
# (running scripts/setup-qwen.sh if needed), then runs the full local pipeline
# (synthetic demo doc -> Docling extraction -> real local LLM classification ->
# personalization match) and writes results to local-run/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env.local ] || ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
  echo "==> Local LLM not ready — running one-time setup..."
  bash scripts/setup-qwen.sh
fi

pnpm local:run:demo
