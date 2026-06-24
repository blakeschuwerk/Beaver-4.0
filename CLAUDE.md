# CLAUDE.md — Beaver 4.0 Source of Truth

This file documents architecture, conventions, and operational procedures for the Beaver 4.0 backend pipeline. Future AI agents and developers should treat this as authoritative.

## What Beaver Does

Scrapes government meeting documents (agendas, packets, minutes, RFPs) to identify infrastructure projects in early planning stages—before public bids. Projects are keyed by **tracking numbers** and evolve through lifecycle stages. Contractors get early visibility via a central projects hub (BigQuery) matched against user profiles (Firestore).

## Folder Structure

```
beaver-4.0/
├── packages/
│   ├── shared/                 # @beaver/shared — TS contracts (source for JSON Schemas)
│   └── shared-py/              # Python pydantic mirrors
├── functions/
│   ├── dispatcher/             # F1 — Node.js
│   ├── scraper/                # F2 — Python
│   ├── analyzer/               # F3 — Python
│   ├── classifier/             # F4 — Node.js
│   └── personalization/        # F5 — Node.js (stub matching logic)
├── stubs/
│   ├── notifier/               # F6 placeholder
│   └── frontend/               # UI placeholder
├── infra/terraform/            # GCP IaC
├── scripts/                    # build-all.sh, deploy.sh
├── CLAUDE.md                   # This file
└── README.md
```

### Why monorepo?

- **Shared contracts** prevent drift between Node and Python services.
- **One Terraform root** provisions the full pipeline.
- **Future components** (frontend, notifier) plug in via existing Pub/Sub topics and BQ tables without rewriting F1–F5.

## Pipeline Flow

```
Cloud Scheduler → dispatcher-tick → F1 Dispatcher
  → scrape-jobs → F2 Scraper → GCS raw-documents
  → raw-documents (GCS notify) → F3 Analyzer → GCS staging-extracted
  → extracted-chunks (GCS notify) → F4 Classifier → BQ projects + projects-created
  → projects-created → F5 Personalization → BQ matches + matches-created (stub)
  → matches-created → F6 Notifier (stub)
```

## Key Architectural Decisions

1. **Node vs Python**: Python only for F2 (civic-scraper, crawl4ai, PyMuPDF) and F3 (Docling). All other functions are Node.js.

2. **Central hub model**: Projects are analyzed once in F4 and stored in BQ `projects`. Users pull from the hub; F5 does NOT run LLM for every user × every project globally.

3. **MERGE upsert on projects**: Same tracking number across many meetings accumulates data (budget, requirements, stage) without duplicates.

4. **Circuit breaker**: Counties marked `broken` with `broken_until` cooldown after N structural failures—not permanent disable.

5. **Idempotency**: `content_hash` (sha256), stable `document_id`, `job_id` per county+date, `project_id` from tracking_number.

6. **Pub/Sub after BQ writes**: F4 publishes `projects-created` after MERGE—not relying on nonexistent BQ insert triggers.

7. **GCS notifications → Pub/Sub**: Raw and staging bucket OBJECT_FINALIZE events trigger F3 and F4.

8. **External LLM**: Qwen 2.5 7B via RunPod/OpenAI-compatible HTTP endpoint. Secret Manager for credentials. `LLM_MOCK_MODE=true` for local dev.

9. **F5 is scaffold**: Two-step matching (niche filter → LLM relevance) is designed but not fully implemented. See `functions/personalization/src/personalization.ts` TODOs.

10. **Discovery Engine**: UNRESOLVED. Flagged in code/Terraform. Do not build until purpose is defined.

## Naming Conventions

| Entity | Pattern | Example |
|--------|---------|---------|
| Cloud Run service | `beaver-{function}` | `beaver-dispatcher` |
| Service account | `beaver-{function}` | `beaver-scraper` |
| Pub/Sub topic | `{event-name}` | `scrape-jobs` |
| DLQ topic | `{topic}-dlq` | `scrape-jobs-dlq` |
| GCS bucket | `{purpose}-{project_id}` | `beaver-raw-documents-myproject` |
| BQ dataset | `beaver_pipeline` | — |
| Document ID | `doc-{county_id}-{hash16}` | — |
| Project ID | `proj-{county_id}-{tracking_number}` | — |
| Job ID | `job-{county_id}-{date}` | — |
| Match ID | `match-{user_id}-{project_id}` | — |

## Pub/Sub Message Schemas

All messages include: `schema_version`, `trace_id` (UUID), `published_at` (ISO datetime).

Canonical definitions: `packages/shared/src/messages.ts` and `packages/shared/contracts/*.json`.

| Topic | Producer | Consumer | Key Fields |
|-------|----------|----------|------------|
| `dispatcher-tick` | Scheduler | F1 | `tick_id`, `scheduled_at` |
| `scrape-jobs` | F1 | F2 | `job_id`, `county_id`, `scraper_strategy`, `source_urls` |
| `raw-documents` | GCS notify | F3 | `gcs_uri`, `document_id`, `county_id`, `content_hash`, `doc_type` |
| `extracted-chunks` | GCS notify | F4 | `gcs_uri`, `document_id`, `county_id`, `chunk_count` |
| `projects-created` | F4 | F5 | `project_id`, `tracking_number`, `niche_tags`, `stage`, `chunk_ids` |
| `matches-created` | F5 | F6 stub | `match_id`, `user_id`, `project_id`, `relevance_score` |

**Sync rule**: JSON Schemas in `packages/shared/contracts/` are source of truth. TypeScript zod and Python pydantic must stay aligned. When changing a message, update all three.

## Data Stores

### Firestore

- `counties`: config + circuit breaker state
- `user_profiles`: contractor profiles (stub schema for F5)

### BigQuery (`beaver_pipeline`)

- `scrape_roster`: dispatcher priority queue
- `projects`: enriched project entities (MERGE upsert)
- `project_chunks`: classified chunk lineage
- `matches`: F5 output (stub)

### GCS

- `beaver-raw-documents-{project_id}`: original PDFs
- `beaver-staging-extracted-{project_id}`: Docling chunk JSON

## Project Lifecycle Stages

From municipal project evolution diagram:

`subcommittee` → `approved` → `bidding` → `awarded` → `closed`

Early stage (`subcommittee`) is highest value—budget and requirements before any contractor is involved.

## Run, Test, Deploy

### Prerequisites

- Node 20+, pnpm 9+, Python 3.11+, Docker, Terraform 1.5+

### Install & build

```bash
pnpm install
pnpm build
```

### Local dev (mock mode — no GCP credentials)

```bash
export MOCK_MODE=true
export LLM_MOCK_MODE=true

pnpm dev:dispatcher      # http://localhost:8080
pnpm dev:classifier      # separate terminal
pnpm dev:personalization # separate terminal

cd functions/scraper && MOCK_MODE=true python -m src.main
cd functions/analyzer && MOCK_MODE=true python -m src.main
```

Trigger dispatcher manually:

```bash
curl -X POST http://localhost:8080/ -d '{}'
```

### Deploy

```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
# Edit project_id

cd infra/terraform && terraform init && terraform apply

export GCP_PROJECT_ID=your-project
./scripts/deploy.sh
```

### Per-function Docker build

```bash
# Node functions (from repo root)
docker build -f functions/dispatcher/Dockerfile -t beaver-dispatcher .
docker build -f functions/classifier/Dockerfile -t beaver-classifier .
docker build -f functions/personalization/Dockerfile -t beaver-personalization .

# Python functions
docker build -f functions/scraper/Dockerfile functions/scraper
docker build -f functions/analyzer/Dockerfile functions/analyzer
```

## Unresolved / Stubs

| Component | Location | Status |
|-----------|----------|--------|
| Frontend UI | `stubs/frontend/` | Not designed |
| Notifier F6 | `stubs/notifier/` | Concept only |
| Discovery Engine | Terraform comment, analyzer comment | Purpose unknown |
| F5 LLM matching | `personalization.ts` TODOs | Scaffold only |
| civic-scraper / crawl4ai | `scraper/src/main.py` | Fallback heuristics until libs installed |
| Docling | `analyzer/src/main.py` | Mock extraction until lib installed |

## Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `GCP_PROJECT_ID` | All | GCP project |
| `MOCK_MODE` | All | Skip GCP calls, use fixtures |
| `LLM_MOCK_MODE` | F4, F5 | Mock LLM responses |
| `LLM_ENDPOINT_URL` | F4 | RunPod/OpenAI-compatible URL |
| `LLM_API_KEY` | F4 | API key for LLM endpoint |
| `GCS_RAW_BUCKET` | F2, F3 | Raw documents bucket name |
| `GCS_STAGING_BUCKET` | F3, F4 | Staging bucket name |
| `PORT` | All | HTTP port (default 8080) |
