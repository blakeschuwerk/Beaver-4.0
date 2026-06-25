#!/usr/bin/env bash
# Pauses beaver-dispatcher-tick (Cloud Scheduler) without touching Terraform state.
# Reversible via scripts/resume-cron.sh. See DEBUG-LOG.md #1.
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-beaver4}"
REGION="${GCP_REGION:-us-central1}"

gcloud scheduler jobs pause beaver-dispatcher-tick \
  --location="$REGION" \
  --project="$PROJECT"

echo "Paused beaver-dispatcher-tick. Resume with: pnpm cron:resume"
