# Beaver 4.0 — Implementation Timeline

> Append-only log tracking execution of [ROADMAP.md](./ROADMAP.md).
> Each entry: **Observed** (what we found), **Decided**, **Did**, **Verified**.

---

## 2026-06-21 — Phase 0/1 kickoff (planning session)

| Field | Detail |
|-------|--------|
| **Phase** | 0 (fold-in) + 1 (plumbing) |
| **Observed** | Live `beaver4`: 12 Pub/Sub topics exist; GCS OBJECT_FINALIZE notifications wired. **Zero Pub/Sub subscriptions** — local `terraform.tfstate` had 0 subscription resources; pipeline unwired end-to-end. Only Firestore DB is `beaver-firebase`. F1/F5 had uncommitted `FIRESTORE_DATABASE` fix; F2 scraper still used default DB. All 5 Cloud Run services deployed; BQ tables exist. |
| **Decided** | Fold Phase 0 leftovers into Phase 1. Create missing subscriptions via terraform apply. Add DLQ IAM + pull subs. Seed synthetic county for plumbing tests. LLM/Docling mock paths remain (Phase 3/4); Phase 1 = real GCS/BQ/PubSub I/O with library fallbacks. |
| **Did** | Created Phase 1 execution plan; verified gcloud auth to `beaver4`. |
| **Verified** | `gcloud run services list` shows all 5 services healthy URLs. |

---

## 2026-06-21 — Phase 0 fold-in

| Field | Detail |
|-------|--------|
| **Phase** | 0 |
| **Observed** | F2 `firestore.Client()` targeted `(default)` DB. Cloud Run `/health` returns 403 without identity token (IAM invoker required). |
| **Decided** | Fix F2 Firestore `databaseId`; add `FIRESTORE_DATABASE=beaver-firebase` to scraper Cloud Run env; commit pending Dockerfile/deploy fixes. |
| **Did** | Updated [functions/scraper/src/main.py](functions/scraper/src/main.py), [infra/terraform/cloud_run.tf](infra/terraform/cloud_run.tf), [.env.example](.env.example). Committed Phase 0 prep. Health-checked all 5 services with `gcloud auth print-identity-token`. |
| **Verified** | All 5 `/health` endpoints return `status: ok`. No `MOCK_MODE=true` on any Cloud Run service. |

---

## 2026-06-21 — Phase 1: Pub/Sub subscriptions + DLQ wiring

| Field | Detail |
|-------|--------|
| **Phase** | 1 |
| **Observed** | `terraform apply` initially failed on duplicate Firestore indexes (409); subscriptions were created successfully. Terraform recreated Cloud Run services (images preserved via redeploy). |
| **Decided** | Import existing Firestore indexes into state. Add `pubsub_dlq.tf` for Pub/Sub service agent IAM + DLQ pull subscriptions. |
| **Did** | Created [infra/terraform/pubsub_dlq.tf](infra/terraform/pubsub_dlq.tf). Applied Terraform — 5 push subscriptions, 6 DLQ pull subs, DLQ IAM bindings. Imported Firestore indexes `CICAgOjXh4EK`, `CICAgJiUpoMK`. |
| **Verified** | `gcloud pubsub subscriptions list` shows 11 subscriptions including `scrape-jobs-scraper-push`, `raw-documents-analyzer-push`, `extracted-chunks-classifier-push`, `projects-created-personalization-push`, `dispatcher-tick-push`, and `*-dlq-pull`. |

---

## 2026-06-21 — Phase 1: Seed data + deploy

| Field | Detail |
|-------|--------|
| **Phase** | 1 |
| **Observed** | `scripts/seed.mjs` could not resolve `@google-cloud/*` from repo root without dispatcher `node_modules`. |
| **Decided** | Fix seed via `createRequire` from dispatcher package; add `pnpm seed` script. Redeploy all services after Terraform service recreation. |
| **Did** | Created [scripts/seed.mjs](scripts/seed.mjs) — seeds `counties/test-county`, `user_profiles/user-plumbing-test`, `scrape_roster` row. Ran `./scripts/deploy.sh` for all 5 services. |
| **Verified** | `pnpm seed` succeeds. Scraper image includes Firestore DB fix. |

---

## 2026-06-21 — Phase 1: End-to-end verification

| Field | Detail |
|-------|--------|
| **Phase** | 1 |
| **Observed** | F3 works (staging `chunks.json` written; Docling fallback). F4 initially failed: placeholder LLM URL, BQ `jobs.create` permission, MERGE correlated subquery, TIMESTAMP null params, streaming buffer on UPDATE. |
| **Decided** | Set `LLM_MOCK_MODE=true` on classifier (Phase 4 will enable real LLM). Add `bigquery.jobUser` for classifier/dispatcher/personalization. Replace MERGE with SELECT + INSERT/UPDATE; use `table.insert` for new projects. |
| **Did** | Fixed [functions/classifier/src/classifier.ts](functions/classifier/src/classifier.ts), [functions/classifier/src/llm-client.ts](functions/classifier/src/llm-client.ts), [infra/terraform/iam.tf](infra/terraform/iam.tf). Uploaded test PDF to raw bucket; confirmed F3→staging→F4→BQ `projects` row `proj-test-county-2024-042`. Published `projects-created` → F5 wrote `matches` row. DLQ test: malformed `raw-documents` message landed in `raw-documents-dlq-pull` after 5 attempts. Dispatcher published `job-test-county-2026-06-21` after `bigquery.jobUser` grant. |
| **Verified** | **Done-when met:** Manual PDF → F3 → staging → F4 → BQ `projects` (real I/O, mock extraction/classification). Dispatcher publishes real scrape-job. DLQ retains poison messages. Trace IDs: `881d1c5c-...` (F3), `00000000-...-101` (F5). |

---

## 2026-06-21 — Phase 1 complete → Phase 2 next

| Field | Detail |
|-------|--------|
| **Phase** | 1 → 2 |
| **Observed** | Pipeline plumbing works end-to-end with library fallbacks. Classifier UPDATE on streaming buffer needs deferred merge strategy (Phase 4). |
| **Decided** | Phase 2: real `civic-scraper` / `crawl4ai` scraping for seeded county URLs. |
| **Did** | Updated ROADMAP.md Phase 1 status. |
| **Verified** | Ready for Phase 2. |

---

## 2026-06-22 — Wire the House: Phases 2–5 code + tooling

| Field | Detail |
|-------|--------|
| **Phase** | 2–5 + cross-cutting |
| **Observed** | All pipeline functions ran library fallbacks in production. No unit tests, no CI, no county maintenance tooling, no operator checklist for credentials/flags. |
| **Decided** | Build all autonomous code behind feature flags (`SCRAPER_REAL`, `USE_DOCLING`, `LLM_MOCK_MODE`) defaulting to safe fallbacks. No deploy this session — commit + push only. Defer Phases 6–8. |
| **Did** | F2: `scrapers.py`, `StructuralScrapeError`, `requirements-scraping.txt`. F3: `USE_DOCLING`, markdown chunking, `requirements-extraction.txt`. F4: DML MERGE upsert, hardened `llm-client.ts`. F5: relevance `llm-client.ts`, tightened niche/geo filter, env thresholds, Terraform LLM secret wiring for personalization. Cross-cutting: CI workflows, unit tests, `config/counties.json`, `seed-counties.mjs`, `check-county-links.mjs`, `integration-test.mjs`, [OUTLETS.md](OUTLETS.md). |
| **Verified** | Local `pnpm local:run:demo` + live Nash County scrape + Docling + Ollama classify/match. See [LOCAL-TESTING.md](LOCAL-TESTING.md). |

---

## 2026-06-22 — Local Llama pipeline test (Steps 1–3)

| Field | Detail |
|-------|--------|
| **Phase** | 2–4 local validation |
| **Observed** | Cloud Run cannot reach localhost Llama; live county scrape requires network + Playwright on user machine. |
| **Decided** | Fully local runner: `scripts/local_pipeline.py` + `scripts/local-classify.mjs` + Ollama via `scripts/setup-llama.sh`. Three counties in config (Legistar, CivicPlus, crawl4ai). Python `.venv` for heavy deps. |
| **Did** | Fixed civic-scraper API (LegistarSite/CivicPlusSite + 90-day window). Added 3 counties, local runners, `pnpm llama:setup`, `pnpm local:run`, `pnpm local:run:demo`, [LOCAL-TESTING.md](LOCAL-TESTING.md). Verified Nash County CivicPlus PDF → Docling (80 chunks) → local Llama projects + matches. |
| **Verified** | Ollama `llama3.1:8b` on localhost:11434; `local-run/classify-summary.json` shows projects + matches. User runs `pnpm local:run` for full 3-county live scrape on their Mac. |

---

## 2026-06-23 — Migrate from Llama-3 to Qwen 2.5 7B

| Field | Detail |
|-------|--------|
| **Phase** | 2–5 LLM swap |
| **Observed** | Llama-3 8B was tested locally but Qwen 2.5 7B offers superior instruction-following for structured extraction (F4 tracking numbers, niche tags, stage) and relevance scoring (F5). Qwen 7B is 10% smaller but faster, optimized for JSON-structured output. |
| **Decided** | Replace all Llama references with Qwen 2.5 7B. Both use OpenAI-compatible API, so LLM client code requires only model name change. Setup script renamed; all env vars and docs updated. OpenAI-compatible RunPod endpoints work identically. |
| **Did** | Updated `functions/classifier/src/llm-client.ts` and `functions/personalization/src/llm-client.ts` (model default `'qwen2.5-7b'`). Renamed `scripts/setup-llama.sh` → `scripts/setup-qwen.sh`; updated model detection (12GB RAM threshold for 7B). Updated `package.json` (added `qwen:setup` script; `llama:setup` is now alias). Updated [LOCAL-TESTING.md](LOCAL-TESTING.md), [OUTLETS.md](OUTLETS.md), [CLAUDE.md](CLAUDE.md), [ROADMAP.md](ROADMAP.md), `scripts/local_pipeline.py`. |
| **Verified** | `pnpm qwen:setup` + `pnpm local:run:demo` + `pnpm local:run` on Mac with `qwen2.5:7b`. Demo: 26 projects / 26 matches (7 docs). Live scrape: 3 Nash County docs + classify; Sonoma still 0 docs. Results in `local-run/classify-summary.json`. |
