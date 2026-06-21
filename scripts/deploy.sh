#!/usr/bin/env bash
# Deploy all Cloud Run services. Requires: gcloud auth, terraform apply, docker.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/beaver"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Set GCP_PROJECT_ID before deploying."
  exit 1
fi

deploy_node() {
  local name="$1"
  local dir="$2"
  echo "==> Building and deploying $name..."
  docker build --platform linux/amd64 -t "${REGISTRY}/${name}:latest" -f "$dir/Dockerfile" .
  docker push "${REGISTRY}/${name}:latest"
  gcloud run services update "$name" \
    --image="${REGISTRY}/${name}:latest" \
    --region="$REGION" \
    --project="$PROJECT_ID"
}

deploy_python() {
  local name="$1"
  local dir="$2"
  echo "==> Building and deploying $name..."
  docker build --platform linux/amd64 -t "${REGISTRY}/${name}:latest" -f "$dir/Dockerfile" "$dir"
  docker push "${REGISTRY}/${name}:latest"
  gcloud run services update "$name" \
    --image="${REGISTRY}/${name}:latest" \
    --region="$REGION" \
    --project="$PROJECT_ID"
}

pnpm build:shared

deploy_node "beaver-dispatcher" "functions/dispatcher"
deploy_python "beaver-scraper" "functions/scraper"
deploy_python "beaver-analyzer" "functions/analyzer"
deploy_node "beaver-classifier" "functions/classifier"
deploy_node "beaver-personalization" "functions/personalization"

echo "Deploy complete."
