# Beaver 4.0 — Architectural Roadmap

> **Purpose of this document.** This is the phased build plan for Beaver 4.0. It records
> (a) exactly where the project stands today, (b) every missing piece and whether we intend
> to build it, and (c) the ordered phases that take us from the current scaffold to a working
> product. It is intentionally a *shell*: each phase states **what** gets built and **how we
> know it's done**, not line-by-line implementation. We expand one phase into detail at the
> time we build it.
>
> **Authority order.** [`CLAUDE.md`](./CLAUDE.md) is the architecture source of truth.
> [`.cursor/rules/`](./.cursor/rules/) holds the invariants. This file governs *sequencing*.
> If this file and CLAUDE.md disagree on architecture, CLAUDE.md wins — update this file.

---

## 1. Where we are right now (verified, not aspirational)

This section is the anti-hallucination anchor. Everything below was confirmed by reading the
code and by the deploy session that provisioned the live project `beaver4`.

### 1.1 Provisioned infrastructure (Terraform applied to project `beaver4`)

| Resource | State | Notes |
|----------|-------|-------|
| GCS buckets (raw, staging) | ✅ Created | `beaver-raw-documents-*`, `beaver-staging-extracted-*` |
| BigQuery dataset + tables | ✅ Created | `beaver_pipeline`: `scrape_roster`, `projects`, `project_chunks`, `matches` |
| Pub/Sub topics + DLQs | ✅ Created | All 6 pipeline topics |
| Firestore database | ⚠️ Created **as `beaver-firebase`**, not `(default)` | See Known Issue #1 |
| Firestore indexes | ✅ Created | Terraform patched to target `beaver-firebase` |
| Artifact Registry | ✅ Created | `us-central1-docker.pkg.dev/beaver4/beaver` |
| Cloud Run services (×5) | ✅ Deployed | Images built `linux/amd64`; dispatcher confirmed booting |
| Cloud Scheduler | ✅ Created | `dispatcher-tick` |
| Billing / APIs | ✅ Enabled | firestore, run, artifactregistry, secretmanager, pubsub, bigquery, storage, cloudscheduler |

### 1.2 Application code — real vs. mock

Every function exists and boots. **None of them do real work yet** — they all run through
`MOCK_MODE` / library-fallback branches. Line counts and the mock branches were verified.

| Fn | Service | Real today | Mocked / stubbed today |
|----|---------|-----------|------------------------|
| F1 Dispatcher | `beaver-dispatcher` | Express handler, Pub/Sub envelope parsing, roster query shape | Roster read & job publish run as `[MOCK]` unless wired |
| F2 Scraper | `beaver-scraper` | Flask handler, link-extraction fallback, circuit-breaker shape | `civic-scraper` + `crawl4ai` **not installed** — heuristic fallback only |
| F3 Analyzer | `beaver-analyzer` | Flask handler, hybrid parent/child chunking | `docling` **not installed** — `extract_mock_text()` returns canned text |
| F4 Classifier | `beaver-classifier` | MERGE-upsert shape, chunk lineage, `projects-created` publish | LLM calls return mock classification unless `LLM_ENDPOINT_URL` set |
| F5 Personalization | `beaver-personalization` | Profile load, niche pre-filter heuristic | `scoreRelevance()` returns hardcoded `0.75` — **no LLM** |

### 1.3 Not started at all

- **F6 Notifier** — `stubs/notifier/` is a README only.
- **Frontend** — `stubs/frontend/` is a README only.
- **Discovery Engine** — flagged UNRESOLVED in code + Terraform; no resources, no design.

### 1.4 Known issues to clear before real traffic

1. **Firestore database name mismatch.** ~~Runtime clients call `new Firestore()` → targets `(default)`~~ **Resolved** — F1/F2/F5 use `FIRESTORE_DATABASE=beaver-firebase`.
2. **End-to-end verification.** ~~Dispatcher only confirmed booting~~ **Resolved for plumbing path** — PDF upload → F3 → F4 → BQ `projects` → F5 `matches` verified (see TIMELINE.md).
3. **Secrets not populated.** `LLM_ENDPOINT_URL` / `LLM_API_KEY` still placeholders — F4 uses `LLM_MOCK_MODE=true` until Phase 4.

**One-line status:** *Phases 0–1 complete. Phases 2–5 code complete behind feature flags (defaults = safe fallbacks). Plug in outlets per [OUTLETS.md](./OUTLETS.md) to go live. Phases 6–8 deferred.*

---

## 2. Target architecture (end state, abbreviated)

Full detail in [`CLAUDE.md`](./CLAUDE.md). The pipeline we are building toward:

```
Scheduler → F1 Dispatcher → scrape-jobs → F2 Scraper → GCS raw
  → F3 Analyzer → GCS staging → F4 Classifier → BQ projects + projects-created
  → F5 Personalization → BQ matches + matches-created → F6 Notifier → user
                                                                         ↑
                                          Frontend reads projects/matches hub
```

Central-hub model: projects analyzed **once** in F4, stored in BQ, pulled by many users.
F5 never runs LLM for every user × every project globally.

---

## 3. Missing-feature inventory & disposition

For each gap: are we building it, deferring it, or killing it?

| Feature | Disposition | Phase |
|---------|-------------|-------|
| Real scraping (`civic-scraper`, `crawl4ai`) | **BUILD** | Phase 2 |
| Real extraction (`docling`) | **BUILD** | Phase 3 |
| Real F4 LLM classification | **BUILD** | Phase 4 |
| F5 two-step niche + LLM matching | **BUILD** | Phase 5 |
| F6 Notifier (email/in-app) | **BUILD** | Phase 6 |
| Frontend + read API | **BUILD** | Phase 7 |
| Discovery Engine | **DEFER — decision gate.** Do not build until a written product
  purpose exists. May be killed. | Phase 8 (gate) |
| Multi-database Firestore split | **DEFER** — not needed at current scale | — |

Nothing is currently slated to be killed outright; Discovery Engine is the only
"kill candidate" and is parked behind an explicit decision gate.

---

## 4. Build phases

Each phase lists: **Goal · What gets built · Files · Done-when · Depends on.**
Phases are ordered so each unlocks the next. Phase 0 and 1 are prerequisites for *any* real data.

### Phase 0 — Stabilize the deployed skeleton
- **Goal:** The five live services are provably healthy and a single message can traverse the
  pipeline in mock mode, end to end.
- **What gets built:** Resolve Known Issue #1 (Firestore DB name); health-check all five
  services; manually publish one `dispatcher-tick` and trace it through to a mock `matches-created`.
- **Files:** `functions/dispatcher/src/dispatcher.ts`, `functions/personalization/src/personalization.ts`
  (Firestore `databaseId`); no new services.
- **Done-when:** `GET /health` returns ok on all five; one trace_id is visible in logs from F1→F5.
- **Depends on:** nothing.
- **Status:** Done. See [TIMELINE.md](./TIMELINE.md).

### Phase 1 — Pipeline plumbing for real data — **COMPLETE (2026-06-21)**
- **Goal:** Turn off mock mode safely; confirm GCS notifications and Pub/Sub subscriptions
  actually trigger F3 and F4; seed the `scrape_roster` and one county in Firestore.
- **What gets built:** Real roster read in F1; GCS→Pub/Sub OBJECT_FINALIZE wiring verified;
  DLQ behavior verified; one real county config document.
- **Files:** `functions/dispatcher/src/dispatcher.ts`, `infra/terraform/pubsub.tf`, `storage.tf`.
- **Done-when:** A manually uploaded PDF to the raw bucket triggers F3 then F4 with real GCS/BQ I/O (library fallbacks for Docling/LLM acceptable until Phases 3–4).
- **Depends on:** Phase 0.
- **Status:** Done. Subscriptions were missing from initial deploy — created via Terraform. See [TIMELINE.md](./TIMELINE.md).

### Phase 2 — Real scraping (F2) — **CODE COMPLETE (pending outlets)**
- **Goal:** Replace heuristic fallback with `civic-scraper` + `crawl4ai`.
- **What gets built:** Library integration, per-strategy scrapers, real document download to GCS,
  circuit-breaker writes to Firestore on structural failure.
- **Files:** `functions/scraper/src/main.py`, `functions/scraper/requirements-scraping.txt`, Dockerfile.
- **Done-when:** A real county URL yields real PDFs in the raw bucket; a forced failure trips the breaker.
- **Depends on:** Phase 1.
- **Status:** Code wired behind `SCRAPER_REAL=false`. Flip flag + add counties per [OUTLETS.md](./OUTLETS.md).

### Phase 3 — Real extraction (F3) — **CODE COMPLETE (pending outlets)**
- **Goal:** Replace `extract_mock_text()` with Docling.
- **What gets built:** Docling integration, real parent/child chunking on real documents,
  chunk JSON to staging bucket.
- **Files:** `functions/analyzer/src/main.py`, `requirements-extraction.txt`, Dockerfile.
- **Done-when:** A real PDF produces real chunk JSON in staging; chunk counts are sane.
- **Depends on:** Phase 2 (needs real raw documents).
- **Status:** Code wired behind `USE_DOCLING=false`. Flip flag + rebuild image per [OUTLETS.md](./OUTLETS.md).

### Phase 4 — Real classification + LLM (F4) — **CODE COMPLETE (pending outlets)**
- **Goal:** Real Qwen 2.5 7B classification producing real `projects` rows.
- **What gets built:** Secret Manager wiring for `LLM_ENDPOINT_URL`/`LLM_API_KEY`; real
  tracking-number extraction, niche tagging, stage detection; MERGE upsert on real data.
- **Files:** `functions/classifier/src/classifier.ts`, `llm-client.ts`; `infra/terraform/secrets.tf`.
- **Done-when:** Real chunks yield a real `projects` row keyed by tracking number; re-running
  the same document MERGEs rather than duplicates.
- **Depends on:** Phase 3 + a reachable LLM endpoint.
- **Status:** DML MERGE upsert + hardened LLM client. Set LLM secrets + `LLM_MOCK_MODE=false` per [OUTLETS.md](./OUTLETS.md).

### Phase 5 — Per-user matching (F5) — **CODE COMPLETE (pending outlets)**
- **Goal:** Implement the designed two-step matching (niche filter → LLM relevance).
- **What gets built:** Real niche/geography pre-filter against the projects hub; real
  `scoreRelevance()` LLM call (replacing the hardcoded `0.75`); real `matches` rows.
- **Files:** `functions/personalization/src/personalization.ts`, `llm-client.ts`.
- **Done-when:** A `projects-created` event yields scored `matches` rows only for niche-overlapping
  users; no global per-user×per-project LLM fan-out.
- **Depends on:** Phase 4 + real `user_profiles`.
- **Status:** Two-step matching implemented with env thresholds. LLM secrets + `LLM_MOCK_MODE=false` per [OUTLETS.md](./OUTLETS.md).

### Phase 6 — Notifier (F6)
- **Goal:** Promote `stubs/notifier/` to a deployed service.
- **What gets built:** `matches-created` subscriber; email (SendGrid/GCP) + in-app notification;
  user notification preferences; rate limiting.
- **Files:** new `functions/notifier/`; Terraform service + subscription; IAM.
- **Done-when:** A new match produces exactly one notification respecting user preferences.
- **Depends on:** Phase 5.

### Phase 7 — Frontend + read API
- **Goal:** Build production app + admin testing console from [FRONTEND-SPEC.md](./FRONTEND-SPEC.md) and [design_handoff_beaver/](./design_handoff_beaver/) (design handoff complete — implementation unblocked).
- **What gets built:** Read API (Cloud Run or Firebase) over `projects`/`matches`/`user_profiles`;
  auth + profile management; project feed with filter/search; match display; admin sandbox console (no BQ writes).
- **Files:** new `apps/frontend/`, new read-API service; Terraform.
- **Done-when:** A contractor can sign in, see their matched projects, and filter the hub.
- **Depends on:** Phase 5 (data to show). UI design handoff is complete.

### Phase 8 — Discovery Engine decision gate (DEFERRED)
- **Goal:** Decide build-or-kill. **No code until a written purpose exists.**
- **What gets built:** Nothing yet — a one-page decision doc resolving why Discovery Engine
  exists, what it indexes, and who consumes it. If approved, it becomes its own phase.
- **Depends on:** product direction, not engineering.

### Cross-cutting (continuous, not a single phase)
- **Observability:** trace_id propagation already in contracts — add structured logging dashboards.
- **Testing:** unit tests per function; integration test script at `scripts/integration-test.mjs`.
- **CI/CD:** `.github/workflows/ci.yml` (build/test) + `deploy.yml` (manual, needs `GCP_SA_KEY`).
- **County maintenance:** `config/counties.json`, `pnpm seed:counties`, `pnpm check:county-links`.
- **Outlets checklist:** [OUTLETS.md](./OUTLETS.md) — credentials, flags, deploy steps.
- **Security:** least-privilege service accounts (already per-function); secret rotation.

---

## 5. Phase dependency graph

```
Phase 0  (stabilize)
   │
Phase 1  (plumbing, mock→real)
   │
Phase 2  (F2 scraping) ──► Phase 3 (F3 extraction) ──► Phase 4 (F4 classify+LLM)
                                                              │
                                                        Phase 5 (F5 matching)
                                                          │        │
                                                  Phase 6 (F6)   Phase 7 (frontend)
Phase 8 (Discovery Engine) — parked, product-gated, parallel/independent
```

**Critical path to a usable product:** Phases 0 → 1 → 2 → 3 → 4 → 5, then 6 and 7 in parallel.
