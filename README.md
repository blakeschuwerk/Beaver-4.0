# Beaver 4.0

Event-driven GCP pipeline that scrapes government meeting documents, extracts early-stage infrastructure projects, and prepares them for contractor matching.

## Architecture

Five Cloud Run services connected via Pub/Sub and GCS:

| Function | Service | Language | Trigger |
|----------|---------|----------|---------|
| F1 Dispatcher | `beaver-dispatcher` | Node.js | Cloud Scheduler → `dispatcher-tick` |
| F2 Scraper | `beaver-scraper` | Python | `scrape-jobs` |
| F3 Analyzer | `beaver-analyzer` | Python | GCS → `raw-documents` |
| F4 Classifier | `beaver-classifier` | Node.js | GCS → `extracted-chunks` |
| F5 Personalization | `beaver-personalization` | Node.js | `projects-created` |

See [CLAUDE.md](./CLAUDE.md) for full architecture documentation.

## Repo structure

```
beaver-4.0/
├── packages/shared/          # @beaver/shared — contracts, schemas, constants
├── packages/shared-py/       # Python pydantic mirrors
├── functions/
│   ├── dispatcher/           # F1
│   ├── scraper/              # F2
│   ├── analyzer/             # F3
│   ├── classifier/           # F4
│   └── personalization/      # F5
├── stubs/
│   ├── notifier/             # F6 placeholder
│   └── frontend/             # UI placeholder
├── infra/terraform/          # IaC
└── scripts/                  # build & deploy helpers
```

## Prerequisites

- Node.js 20+, pnpm 9+
- Python 3.11+ (for local Python function dev)
- Docker
- Terraform 1.5+
- GCP project (credentials not required to scaffold; needed to deploy)

### Enable pnpm (one-time)

This repo pins pnpm via `packageManager` in `package.json`. If `pnpm` is not found:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

Then verify: `pnpm -v` should print `9.15.0`.

## Quick start

```bash
# Install dependencies
pnpm install

# Build shared package + Node functions
pnpm build

# Copy env template
cp .env.example .env

# Run dispatcher locally (mock mode)
pnpm dev:dispatcher
```

## Deploy

1. Copy `infra/terraform/terraform.tfvars.example` → `terraform.tfvars` and set `project_id`.
2. `cd infra/terraform && terraform init && terraform apply`
3. `export GCP_PROJECT_ID=your-project && ./scripts/deploy.sh`

## Local Python functions

```bash
cd functions/scraper && pip install -r requirements.txt && python -m src.main
cd functions/analyzer && pip install -r requirements.txt && python -m src.main
```

Set `MOCK_MODE=true` to run without GCP credentials.

## Unresolved / stubs

- **Frontend UI** — `stubs/frontend/`
- **Notifier (F6)** — `stubs/notifier/`
- **Discovery Engine** — flagged in code; no resources provisioned
- **F5 per-user matching** — scaffold only; two-step niche filter + LLM scoring TODO
