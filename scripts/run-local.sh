#!/usr/bin/env bash
# Run the full Beaver app locally: the real backend with the LLM running locally,
# reading real BigQuery/Firestore but writing NOTHING. Opens the dashboard UI.
#
#   pnpm app
#
# One-time config lives in .env.local (created by `pnpm qwen:setup`); set
# GCP_PROJECT_ID and LOCAL_USER_ID there. Requires Google ADC creds for reads
# (`gcloud auth application-default login`).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load one-time local config (LLM endpoint, GCP project, LOCAL_USER_ID, etc.)
if [ -f .env.local ]; then
  set -a; source .env.local; set +a
else
  echo "No .env.local — run: pnpm qwen:setup (sets up the local LLM + config)"
  exit 1
fi

# The local-dev contract: real reads, suppressed writes, local LLM. Forced here
# so a single command is always correct regardless of what's in .env.local.
export MOCK_MODE=false
export LOCAL_NO_WRITES=true
export LLM_LOCAL_ONLY=true

if [ -z "${LOCAL_USER_ID:-}" ]; then
  echo "WARNING: LOCAL_USER_ID is not set in .env.local — the dashboard reads"
  echo "         per-user data, so set it to your real user id to see your projects."
fi

# Make sure the local LLM is reachable before starting the backend.
if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
  echo "==> Local LLM not running — starting Ollama..."
  ollama serve &>/dev/null &
  for _ in $(seq 1 20); do
    curl -sf http://localhost:11434/api/tags &>/dev/null && break
    sleep 1
  done
fi

echo "==> Building..."
pnpm build >/dev/null

# Backend API (real reads, writes suppressed) on :8080.
echo "==> Starting backend API on http://localhost:8080 ..."
PORT=8080 pnpm --filter @beaver/api start &
API_PID=$!
# Always clean up the backend when the UI is stopped (Ctrl-C).
trap 'kill "$API_PID" 2>/dev/null || true' EXIT INT TERM

# Frontend dev server on :5173, proxying /api -> :8080 (see vite.config).
# VITE_MOCK_MODE=true skips the Firebase login screen; the backend decides whose
# real data to show via LOCAL_USER_ID.
echo "==> Starting UI on http://localhost:5173 ..."
echo ""
echo "    Open: http://localhost:5173"
echo ""
VITE_MOCK_MODE=true pnpm --filter @beaver/frontend dev
