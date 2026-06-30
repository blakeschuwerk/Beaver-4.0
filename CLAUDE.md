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

8. **External LLM**: Qwen 2.5 7B via RunPod/OpenAI-compatible HTTP endpoint. Secret Manager for credentials in prod. Always called for real — local dev points `LLM_ENDPOINT_URL` at a local model server instead of RunPod, guarded by `LLM_LOCAL_ONLY=true`.

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

### Run the app locally (the dashboard UI) — `pnpm app`

**"Run my app" / "see my app" means the frontend dashboard at `apps/frontend`**, not
the F1–F5 pipeline. One command:

```bash
pnpm app    # backend API on :8080 + UI on http://localhost:5173
```

This is the **local read-only** contract: the full real backend runs, the LLM runs
**locally** (Ollama) instead of RunPod, the API **reads real BigQuery/Firestore**, and
**every write is suppressed** (nothing is persisted). It is NOT mock/fixture mode —
you see your real data, you just can't change it.

One-time setup:

```bash
pnpm qwen:setup                          # installs Ollama + pulls the model, writes .env.local
gcloud auth application-default login    # ADC creds so the API can read BigQuery/Firestore
# then edit .env.local: set GCP_PROJECT_ID and LOCAL_USER_ID (your real user id)
```

After that, just `pnpm app`. Env knobs (all live in `.env.local`, auto-loaded — no
manual `export` needed):

| Var | Meaning |
|-----|---------|
| `LOCAL_NO_WRITES=true` | Real reads, all writes become no-ops (the read-only contract). |
| `LOCAL_USER_ID` | Real user id to impersonate, so the dashboard shows your projects/matches without a Firebase login. |
| `LLM_ENDPOINT_URL` + `LLM_LOCAL_ONLY=true` | Local model server; guardrail refuses any non-localhost endpoint. |
| `GCP_PROJECT_ID` | Project whose BigQuery/Firestore is read. |

> ⚠️ **`MOCK_MODE` means two different things in this repo — don't conflate them:**
> - In the **API** (`functions/api`), `MOCK_MODE=true` serves canned **fixtures** and runs
>   no real logic. `LOCAL_NO_WRITES=true` (used by `pnpm app`) is the opposite: real
>   reads, real local LLM, only writes suppressed.
> - In the **pipeline functions** (dispatcher/scraper/analyzer), `MOCK_MODE=true` means
>   "run the real logic but skip GCS/Pub-Sub/BigQuery/Firestore."

### Run the backend pipeline locally (F1–F5, no UI)

Separate from the UI. `MOCK_MODE=true` skips GCS/Pub-Sub/BigQuery/Firestore (no GCP
creds needed); the LLM is **always called for real** against your local model server.

```bash
export MOCK_MODE=true
export LLM_LOCAL_ONLY=true
export LLM_ENDPOINT_URL=http://localhost:11434/v1/chat/completions  # local model server

pnpm dev:dispatcher      # http://localhost:8080
pnpm dev:classifier      # separate terminal
pnpm dev:personalization # separate terminal
cd functions/scraper && MOCK_MODE=true python -m src.main
cd functions/analyzer && MOCK_MODE=true python -m src.main

curl -X POST http://localhost:8080/ -d '{}'   # trigger dispatcher
```

There is no more `LLM_MOCK_MODE` — removed. The classifier and personalization LLM
clients always call `LLM_ENDPOINT_URL` for real; the only heuristic fallback left is
parse recovery when the LLM returns malformed JSON (see `mockClassification` /
`mockRelevance` in each `llm-client.ts`), never a substitute for the call itself.

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

## Debug Log

[DEBUG-LOG.md](DEBUG-LOG.md) is a quick-reference list of discrete bugs/issues — narrower
and faster to scan than TIMELINE.md's full session narratives. When debugging something
that feels like it might be a known issue, check it. When you identify a real issue, add
a numbered entry. When you fix it, strike through the symptom and append
**Resolved [date]** with a one-line fix summary. Not a mandatory pre-check on every task —
use it when it's actually relevant to what you're debugging.

## Failure & Observability Principles

These are design rules for *all* Beaver work, learned from a real incident: a silent
mock fallback in the classifier let a failing RunPod endpoint write fabricated data to
BigQuery and report success for hours, undetected, while billing for GPU time (see
[DEBUG-LOG.md](DEBUG-LOG.md) #1). Apply them whenever you add or change a component.

1. **No silent fallbacks in production.** `MOCK_MODE=true` is the only mock-data
   convenience, and it's local-dev-only (skips GCS/Pub-Sub/BigQuery/Firestore so no GCP
   credentials are needed). The LLM is never mocked — local dev calls a real local model
   server instead of RunPod (see "Local dev" above), so an LLM failure surfaces the same
   way in dev and prod. When `MOCK_MODE` is off, a failed dependency must fail visibly —
   never substitute fake data for a real result.
2. **Every external call is observable.** Log the outcome (status, latency, attempt) in
   the shared structured shape via `logEvent()` from `@beaver/shared`, so a failure is
   diagnosable from logs alone — no RunPod or GCP console required. Read them with
   `pnpm logs:errors` (local) or `pnpm logs:errors --prod` (Cloud Logging).
3. **Contain the blast radius.** A single failing item should fail that item (let the
   Pub/Sub message dead-letter for retry), not corrupt the datastore or silently poison
   a whole run. Throw a typed error (e.g. `LlmUnavailableError`) and let the HTTP handler
   return non-2xx so the message redelivers.
4. **Make it loud before you make it graceful.** Add visibility first. Only add
   degradation/retry tuning once you can actually see the failure happening.

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
| `MOCK_MODE` | All | Pipeline funcs: skip GCS/Pub-Sub/BQ/Firestore. API: serve canned fixtures. Never affects the LLM call. |
| `LOCAL_NO_WRITES` | API | `pnpm app` mode: real reads, all writes suppressed. Opposite of API `MOCK_MODE`. |
| `LOCAL_USER_ID` | API | Real user id to impersonate in read-only mode (skips Firebase login locally). |
| `LLM_ENDPOINT_URL` | F4, F5, API sandbox | RunPod URL (prod) or local model server URL (dev) — always called for real |
| `LLM_LOCAL_ONLY` | F4, F5, API sandbox | When true, refuses to run unless `LLM_ENDPOINT_URL` is localhost/127.0.0.1. Set in local dev to avoid hitting prod RunPod by accident. |
| `LLM_API_KEY` | F4, F5 | API key for LLM endpoint |
| `GCS_RAW_BUCKET` | F2, F3 | Raw documents bucket name |
| `GCS_STAGING_BUCKET` | F3, F4 | Staging bucket name |
| `PORT` | All | HTTP port (default 8080) |
