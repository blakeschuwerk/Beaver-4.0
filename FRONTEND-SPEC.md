# Beaver 4.0 — Frontend Design Spec (Phase 7)

> Handoff spec for Claude Design (visuals) → Cursor (implementation).
> This describes **content and data per screen**, not pixel layout — visual design is
> intentionally left open for Claude Design to interpret under the principles below.

---

## Design Principles

- **Simple, elegant, minimal.** No badge-stacking, no redundant nav, generous whitespace.
- One primary accent color, clear type hierarchy, calm density — not a dashboard-everything-at-once feel.
- Two apps share this spec: **Production app** (any signed-up user) and **Admin Testing Console** (admin-only).

## Roles

| Role | Access |
|------|--------|
| `user` | Default for anyone who signs up — contractor, salesperson, estimator, etc. Role/job title is irrelevant to permissions. |
| `admin` | Everything a `user` has, plus the Testing Console (Part 2). |

No further RBAC needed for v1.

---

## PART 1 — Production App

### Screen 1 — Sign Up / Login
- Email/password or SSO
- Onboarding fields → creates `UserProfile`:
  - `company` (text)
  - `service_categories` (multi-select tags, e.g. "Roadway," "Drainage," "HVAC")
  - `geography` (multi-select counties/states)

### Screen 2 — Dashboard (home)
Two sections:
- **New Matches** — recently matched projects, sorted by match strength (`relevance_score`). Card: project name, agency/county, estimated budget, stage badge, match %, 2-3 trade tags.
- **Tracked Project Updates** — bookmarked projects where stage changed since last visit. Same card style + "changed" indicator.

### Screen 3 — Lead Feed (browse/search all matches)
- Filters: stage, county, trade tag, minimum match %
- Same project card format as Dashboard
- Click card → Project Details

### Screen 4 — Project Details
- Full fields: `project_type`, `tracking_number`, `stage` (progress bar across canonical stages below), `estimated_budget`, `requirements`, `location`, `bid_deadline`, `niche_tags`, relevance `rationale` ("why this matched you")
- Primary action: **Track this project** (bookmark — confirmed feature, requires new `tracked_projects` data: `{user_id, project_id, tracked_at}`)

### Screen 5 — Tracked Projects
- List of only bookmarked projects, same card format, "changed since last view" indicator

### Screen 6 — Project Updates (feed)
- Chronological log of stage changes for tracked projects only
- e.g. "Twin Lakes Park Renovation moved from Early Planning → Out for Bid · 2 days ago"

### Canonical Stage Taxonomy
Backend enum is the source of truth (`packages/shared/src/constants.ts` `PROJECT_STAGES`) — do **not** invent new stages. Frontend may apply cosmetic display labels only:

| Backend value | Display label |
|---|---|
| `subcommittee` | Early Planning |
| `approved` | Approved |
| `bidding` | Out for Bid |
| `awarded` | Awarded |
| `closed` | Closed |

---

## PART 2 — Admin Testing Console

**Purpose:** Visualize the pipeline's internal wiring on a single test document, without touching production data. Calls the real Qwen 2.5 7B model but **writes nothing to BigQuery** (confirmed requirement — sandbox only).

### Screen 1 — Test Input
- Paste a document URL or upload a sample PDF
- Pick/enter a test user profile (service categories + geography) to run relevance scoring against
- One button: **Run Test** — clearly labeled "Sandbox — nothing is saved"

### Screen 2 — Pipeline Trace (single scrollable result view, step by step, each stage collapsible)

1. **Scraper** — documents discovered, doc-type classification, county circuit-breaker status (healthy/broken)
2. **Extraction (Docling)** — extracted text preview, parent/child chunk breakdown with chunk count
3. **Classifier filter** — per chunk, Qwen's `is_project` yes/no
4. **Classifier extraction** — for chunks that passed: `tracking_number`, `project_type`, `niche_tags`, `stage`, `estimated_budget`, `requirements`, `location`, `bid_deadline`, `confidence`
5. **Relevance scoring** — given the test profile: `relevance_score` + `rationale` from Qwen

### Implementation note (for Cursor, not Claude Design)
The Testing Console must call `classifyChunk()` and `scoreProjectRelevance()` (in `functions/classifier/src/llm-client.ts` and `functions/personalization/src/llm-client.ts`) **directly** via new admin-only endpoints — bypassing Pub/Sub and BigQuery writes entirely. This is the only way to exercise real Qwen calls without polluting production data.

---

## Open / Deferred Items

- **Source attribution** ("Discovered via County Commission Workshop Minutes" + "View source" link) — not yet wired to a clean per-project field. Defer to v2 unless confirmed as v1 must-have.
- **Notifier (F6)** — Project Updates feed in v1 is a polling read, not a push notification. Real-time notifications are Phase 6, deferred per [ROADMAP.md](ROADMAP.md).
