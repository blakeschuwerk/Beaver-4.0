#!/usr/bin/env bash
# Resumes beaver-dispatcher-tick (Cloud Scheduler). Only run this once the LLM
# request/response handling in functions/classifier/src/llm-client.ts (and
# functions/personalization/src/llm-client.ts) has been fixed and verified against
# the real RunPod endpoint — see DEBUG-LOG.md #1.
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-beaver4}"
REGION="${GCP_REGION:-us-central1}"

gcloud scheduler jobs resume beaver-dispatcher-tick \
  --location="$REGION" \
  --project="$PROJECT"

echo "Resumed beaver-dispatcher-tick."
