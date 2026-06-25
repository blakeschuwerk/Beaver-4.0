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

---

## 2026-06-24 — Production deploy: Bundles A, B, C live on `beaver4`

| Field | Detail |
|-------|--------|
| **Phase** | 2–5 production go-live |
| **Observed** | Code for Phases 2–5 was complete behind feature flags but never flipped in production. Terraform state already had `SCRAPER_REAL=true`/`USE_DOCLING=true` from prior manual drift (the committed `.tf` source said `false`) — a separate Cursor-authored commit (`1bef3f2`) had already synced source to match. RunPod account, Qwen 2.5 7B sync endpoint, and API key were ready but not wired into Secret Manager. |
| **Decided** | Complete all three outlet bundles in one session since prerequisites were ready: seed counties, apply Terraform, store RunPod credentials in Secret Manager, flip `LLM_MOCK_MODE=false`, redeploy affected services. |
| **Did** | `pnpm check:county-links` (both counties 200 OK) → `pnpm seed:counties` (Sonoma + Nash into Firestore + BQ roster) → `terraform apply` (flags live on all 5 Cloud Run services) → built/pushed all 5 Docker images via `./scripts/deploy.sh` → stored `llm-endpoint-url` (RunPod runsync) and `runpod-api-key` in Secret Manager → flipped `LLM_MOCK_MODE` to `false` for classifier + personalization in `infra/terraform/cloud_run.tf` → `terraform apply` again → rebuilt/redeployed only `beaver-classifier` and `beaver-personalization` (the two services whose env actually changed) → committed (`10997cc`) and pushed all pending commits to `origin/main`. |
| **Verified** | Cloud Scheduler (`0 */6 * * *`) fired the pipeline automatically post-deploy. BQ `beaver_pipeline.projects` has fresh Nash County rows dated `2026-06-24 18:03:59` (5 total rows). BQ `beaver_pipeline.matches` has 3 rows. Raw bucket `gs://beaver-raw-documents-beaver4/` has real PDFs under `nc-nashcounty/`; **zero objects under `sonoma-county/`** — Sonoma (Legistar) still produces 0 docs in production, matching the unresolved local-test behavior. Did not manually run `pnpm test:integration`; relied on the live scheduled run instead. **Confirmed bug, not an artifact:** `proj-nc-nashcounty-2024-042` is genuinely duplicated in `projects` — two physical rows, same `project_id`/`source_document_ids`/`content_hash`, `first_seen_at` one second apart (`06:01:31` vs `06:01:32`), both with `last_updated_at = 2026-06-24 18:03:59`. Root cause: the classic BQ streaming-buffer MERGE race already seen in this project (see prior entries) — two classifier MERGE calls for the same tracking number landed close enough together that the second one's row wasn't yet MERGE-visible, so its `WHEN NOT MATCHED` branch inserted instead of updating. **Not fixed this session** — needs either a dedup pass on `projects` or a per-tracking-number write lock in F4 before Phase 6/7 rely on exact row counts. |

---

## 2026-06-24 — Phase 7: Frontend + read API (code complete)

| Field | Detail |
|-------|--------|
| **Phase** | 7 |
| **Observed** | Phase 5 live data available in BQ (`projects`, `matches`) and Firestore (`counties`, `user_profiles`). Design handoff complete (`FRONTEND-SPEC.md`, `design_handoff_beaver/`). No frontend or read API existed — only stale `stubs/frontend/README.md`. Known data gaps: `relevance_score` is 0–1 in backend (design shows 0–100); Nash County only real producer; duplicate `project_id` rows in BQ from MERGE race. |
| **Decided** | Build `apps/frontend/` (Vite + React + react-router, pixel-exact to design handoff) and `functions/api/` (`beaver-api` Cloud Run read service). Frontend never queries BQ directly. Auth via Firebase ID token (mock mode bypass for local dev). Admin sandbox: Node-side URL/PDF extract + chunking (steps 1–2 approximated), real Qwen via imported `classifyChunk()` / `scoreProjectRelevance()` (steps 3–5), zero BQ/GCS writes. BQ reads dedupe via `ROW_NUMBER() PARTITION BY project_id`. Deploy deferred — code-complete + locally runnable only (matches Phases 2–5 outlet pattern). |
| **Did** | Extended `@beaver/shared` (`trackedProjectSchema`, optional `role`, `STAGE_DISPLAY_LABELS`, `FS_TRACKED_PROJECTS_COLLECTION`, `SERVICE_API`). Created `functions/api/` with read endpoints (`/api/projects`, `/api/matches`, `/api/profile`, `/api/tracks`, `/api/updates`, `/api/counties`) + admin sandbox (`POST /api/admin/pipeline/test`, `GET .../trace/:jobId`). Created `apps/frontend/` with all 9 screens (auth, dashboard, lead feed, project details + stage tracker, tracked, updates, admin input, admin trace), shared components (Project Card, Stage/Match badges, Stage Change Graphic, County Dropdown). Terraform: `beaver-api` Cloud Run service + SA/IAM in `cloud_run.tf`/`iam.tf`. `firebase.json` hosting config. Root scripts `pnpm dev:api`, `pnpm dev:frontend`. Updated `scripts/deploy.sh` for `beaver-api`. |
| **Verified** | `pnpm build` passes (shared, api, frontend, all pipeline functions). `MOCK_MODE=true pnpm --filter @beaver/api dev` → `GET /health` ok; `GET /api/profile` returns mock admin user; `GET /api/projects?minMatch=50` returns 3 Nash County projects with `match: 87` (display) from `relevance_score: 0.87` (raw). Frontend production build succeeds (`apps/frontend/dist/`). Deploy to `beaver4` not performed this session. |

---

## 2026-06-24 — Cron pause + fail-loud LLM + in-program observability

| Field | Detail |
|-------|--------|
| **Phase** | Cross-cutting (reliability/observability) |
| **Observed** | RunPod dashboard showed 68 failed requests + ~$0.13 GPU billing at 18:00 UTC with no one testing — the production Cloud Scheduler `beaver-dispatcher-tick` (`0 */6 * * *`, not paused) firing the full pipeline against the live RunPod Qwen endpoint. Gemini log analysis of that run revealed the real failure mode: RunPod responded in 110+s (past the 30s timeout); each timeout aborted the fetch and **both LLM clients silently fell back to mock data and returned HTTP 200**, writing fabricated rows to BigQuery undetected. One HTTP 500 also appeared: BQ `projects` MERGE serialization race under concurrent writes (same race behind earlier duplicate rows). No outbound RunPod request logging existed, so failures were invisible without a vendor console. |
| **Decided** | (1) Pause the cron now (reversible) until the engine is proven. (2) Kill the silent production fallback — mock only when `LLM_MOCK_MODE=true`; otherwise throw `LlmUnavailableError` so the handler 500s and the message dead-letters. (3) Add shared structured logging + outbound LLM logging + a `pnpm logs:errors` command so failures are readable from the repo, not RunPod/GCP (optimized for Claude reading, ~zero storage). (4) Codify a durable "Failure & Observability Principles" rule rather than one-off guards. (5) Diagnose-first on RunPod latency — capture real status codes before choosing keep-warm vs. raised timeout. (6) Log the BQ MERGE race as a separate open issue, not fixed this pass. |
| **Did** | `pnpm cron:pause` (added `scripts/pause-cron.sh` / `resume-cron.sh` + `cron:pause`/`cron:resume`). Added `packages/shared/src/observability.ts` (`logEvent`, `LlmUnavailableError`; lazy `node:fs` NDJSON sink gated on `BEAVER_ERROR_LOG`). Rewrote `callLlm()` in `functions/classifier/src/llm-client.ts` + `functions/personalization/src/llm-client.ts` to log per-attempt outcomes and throw on exhaustion; removed personalization's double silent fallback. Added `scripts/logs-errors.mjs` + `pnpm logs:errors` (local NDJSON; `--prod` reads Cloud Logging). Added `BEAVER_ERROR_LOG` to `.env.local` + `setup-qwen.sh`; gitignored `local-run/errors.ndjson`. Added "Failure & Observability Principles" to CLAUDE.md + mirror in `.cursor/rules/node-functions.mdc`. Created `DEBUG-LOG.md` (#1 cron/fallback, #2 BQ race) + wired it into CLAUDE.md and HIERARCHY.md (Tier 2). |
| **Verified** | `pnpm build` passes (shared, all functions, api, frontend — confirms lazy fs import doesn't break the Vite bundle). Synthetic dead-endpoint run with `LLM_MOCK_MODE=false`: `classifyChunk()` threw `LlmUnavailableError` (code `LLM_UNAVAILABLE`), emitted 3 structured log lines, and `pnpm logs:errors` read them back from the NDJSON sink. `LLM_MOCK_MODE=true` still returns mock without throwing (local dev preserved). Classifier + personalization unit tests pass (8/8 personalization, classifier suite green). Cron confirmed paused via `pnpm cron:pause` ("Job has been paused."). **Open:** RunPod 110s latency root cause (diagnose before resuming cron); BQ `projects` MERGE race (DEBUG-LOG #2). |
