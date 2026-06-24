# OUTLETS — What You Plug In Later

> The codebase is wired; these are the **human-operated steps** to turn mock/fallback
> behavior into production behavior. Work through sections in order when you're ready.

---

## Quick reference

| Outlet | When | Where to set it |
|--------|------|-----------------|
| LLM endpoint + API key | Phase 4 + 5 | GCP Secret Manager |
| `LLM_MOCK_MODE=false` | After LLM secrets | [infra/terraform/cloud_run.tf](infra/terraform/cloud_run.tf) → `terraform apply` |
| Real county URLs | Phase 2 | [config/counties.json](config/counties.json) |
| `SCRAPER_REAL=true` | After counties + scraper deps | [infra/terraform/cloud_run.tf](infra/terraform/cloud_run.tf) |
| `USE_DOCLING=true` | Phase 3 | [infra/terraform/cloud_run.tf](infra/terraform/cloud_run.tf) |
| GitHub deploy secret | CI/CD | GitHub repo → Settings → Secrets |
| Deploy + verify | After any outlet | `./scripts/deploy.sh` + `pnpm test:integration` |

---

## 1. LLM credentials (Phases 4 + 5)

**What:** RunPod (or OpenAI-compatible) endpoint for F4 classification and F5 relevance scoring.

**Where to get credentials:**
1. Create a RunPod account: https://www.runpod.io/
2. Deploy a Qwen 2.5 7B (or compatible) serverless/pod endpoint
3. Copy the **OpenAI-compatible URL** (ends in `/v1/chat/completions`) and **API key**

**Where to put them (GCP Secret Manager):**

```bash
export GCP_PROJECT_ID=beaver4

# Replace with your real values:
echo -n 'https://YOUR-ENDPOINT/v1/chat/completions' | \
  gcloud secrets versions add llm-endpoint-url --data-file=- --project=$GCP_PROJECT_ID

echo -n 'YOUR-RUNPOD-API-KEY' | \
  gcloud secrets versions add runpod-api-key --data-file=- --project=$GCP_PROJECT_ID
```

Secrets are defined in [infra/terraform/secrets.tf](infra/terraform/secrets.tf). Placeholder versions exist — add new versions (above) to replace them.

**Flip mock mode off:**

Edit [infra/terraform/cloud_run.tf](infra/terraform/cloud_run.tf):
- `beaver-classifier` → `LLM_MOCK_MODE` = `"false"`
- `beaver-personalization` → `LLM_MOCK_MODE` = `"false"`

Then:
```bash
cd infra/terraform && terraform apply
./scripts/deploy.sh   # redeploy F4 + F5 images if code changed
```

**Verify:** Re-run pipeline on a real document; check BQ `projects` row fields look correct (tracking number, niche_tags, stage).

---

## 2. County configs (Phase 2)

**What:** Real government meeting URLs per county, with correct scraper strategy.

**Where to configure:** [config/counties.json](config/counties.json)

**Schema per county:**

```json
{
  "county_id": "st-johns-fl",
  "name": "St. Johns County",
  "state": "FL",
  "source_urls": ["https://..."],
  "scraper_strategy": "civic_scraper",
  "platform": "legistar",
  "priority": 1,
  "notes": "Optional notes"
}
```

**How to pick `scraper_strategy`:**
| Platform | Strategy | Notes |
|----------|----------|-------|
| Legistar, CivicPlus (known civic-scraper adapter) | `civic_scraper` | Set `platform` field |
| Unknown / custom HTML site | `crawl4ai` | Generic link extraction |
| Fully custom | `custom` | Future — use `crawl4ai` for now |

**Seed to Firestore + BQ roster:**
```bash
export GCP_PROJECT_ID=beaver4
pnpm seed:counties
```

**Validate links before scraping:**
```bash
pnpm check:county-links
pnpm check:county-links -- --county-id=st-johns-fl
```

**Known limitation:** Some counties split docs across two domains (see [architecture-notes.md](architecture-notes.md)). Not supported yet — flag in `notes` field.

---

## 3. Feature flags (flip after outlets above)

All default to **safe fallback** behavior. Set in [infra/terraform/cloud_run.tf](infra/terraform/cloud_run.tf), then `terraform apply` + redeploy.

| Flag | Service | Default | Flip when |
|------|---------|---------|-----------|
| `SCRAPER_REAL` | beaver-scraper | `false` | Counties seeded + scraper image rebuilt with `requirements-scraping.txt` |
| `USE_DOCLING` | beaver-analyzer | `false` | Analyzer image rebuilt with `requirements-extraction.txt` |
| `LLM_MOCK_MODE` | beaver-classifier, beaver-personalization | `true` | LLM secrets populated (Section 1) |

**Rebuild scraper/analyzer with heavy deps (when ready):**

```bash
# Scraper — add to Dockerfile or build arg:
pip install -r requirements.txt -r requirements-scraping.txt

# Analyzer:
pip install -r requirements.txt -r requirements-extraction.txt
```

Optional dep files:
- [functions/scraper/requirements-scraping.txt](functions/scraper/requirements-scraping.txt)
- [functions/analyzer/requirements-extraction.txt](functions/analyzer/requirements-extraction.txt)

---

## 4. F5 matching thresholds (optional tuning)

Env vars on `beaver-personalization` in [infra/terraform/cloud_run.tf](infra/terraform/cloud_run.tf):

| Var | Default | Meaning |
|-----|---------|---------|
| `MATCH_MIN_RELEVANCE` | `0.5` | Minimum LLM score to write a match |
| `MATCH_MAX_PER_PROJECT` | `10` | Cap matches per project event |

Also seed test users in Firestore (`user_profiles` collection, database `beaver-firebase`):
```bash
pnpm seed   # includes one test user
```

---

## 5. GitHub Actions CI/CD

**CI** runs automatically on push/PR — no secrets needed.

**Deploy workflow** ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) requires:

| Secret | Value |
|--------|-------|
| `GCP_SA_KEY` | JSON key for a service account with Artifact Registry + Cloud Run deploy permissions |

Add at: GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

Trigger manually: **Actions → Deploy → Run workflow**

---

## 6. Deploy + verify (after any outlet change)

```bash
export GCP_PROJECT_ID=beaver4
export GCP_REGION=us-central1

# 0. Rebuild images BEFORE or immediately AFTER flag flips — SCRAPER_REAL/USE_DOCLING
#    require requirements-scraping.txt / requirements-extraction.txt in the image.
#    terraform apply alone does not rebuild containers.

# 1. Apply infra changes (flags, IAM)
cd infra/terraform && terraform apply && cd ../..

# 2. Build + push all Cloud Run images
./scripts/deploy.sh

# 3. Health check (requires identity token)
TOKEN=$(gcloud auth print-identity-token)
for svc in beaver-dispatcher beaver-scraper beaver-analyzer beaver-classifier beaver-personalization; do
  curl -s -H "Authorization: Bearer $TOKEN" \
    "https://${svc}-XXXXX-uc.a.run.app/health"   # use actual URLs from gcloud run services list
done

# 4. End-to-end integration test (uploads PDF, polls BQ)
pnpm test:integration
```

**Manual PDF path (alternative verify):**
1. Upload PDF to `gs://beaver-raw-documents-beaver4/{county_id}/...`
2. Check staging bucket for `chunks.json`
3. Query BQ: `SELECT * FROM beaver_pipeline.projects ORDER BY last_updated_at DESC LIMIT 5`
4. Query BQ: `SELECT * FROM beaver_pipeline.matches ORDER BY matched_at DESC LIMIT 5`

---

## 7. Bundle checklist (recommended order)

### Bundle A — Real scraping (Phase 2)
- [ ] Add real counties to [config/counties.json](config/counties.json)
- [ ] `pnpm seed:counties` + `pnpm check:county-links`
- [ ] Rebuild scraper with `requirements-scraping.txt`
- [ ] Set `SCRAPER_REAL=true` → `terraform apply` → `./scripts/deploy.sh`
- [ ] Trigger dispatcher tick; confirm PDFs in raw bucket

### Bundle B — Real extraction (Phase 3)
- [ ] Rebuild analyzer with `requirements-extraction.txt`
- [ ] Set `USE_DOCLING=true` → `terraform apply` → redeploy analyzer
- [ ] Spot-check chunk quality in staging bucket

### Bundle C — Real LLM (Phases 4 + 5)
- [ ] Section 1 (LLM secrets)
- [ ] Set `LLM_MOCK_MODE=false` on F4 + F5 → `terraform apply` → redeploy
- [ ] `pnpm test:integration` — review project + match quality

### Bundle D — Later (Phases 6–8)
Deferred: Notifier, Frontend, Discovery Engine decision. No outlets yet.

---

## 8. Local dev reference

Copy [.env.example](.env.example) to `.env`. Key vars:

```
MOCK_MODE=true          # skip all GCP calls locally
LLM_MOCK_MODE=true      # heuristic classification/scoring
SCRAPER_REAL=false      # aiohttp PDF link fallback
USE_DOCLING=false       # mock text extraction
FIRESTORE_DATABASE=beaver-firebase
```

Run locally:
```bash
pnpm install && pnpm build
pnpm dev:dispatcher     # terminal 1
pnpm dev:classifier     # terminal 2
pnpm dev:personalization # terminal 3
```
