# Cursor prompt — bulk county platform discovery

Paste everything below into Cursor.

---

## Context

Beaver 4.0 scrapes government meeting documents to find infrastructure projects
(see `CLAUDE.md`). The scraper (F2) supports two strategies per county:

- `scraper_strategy: "civic_scraper"` with `platform: "legistar" | "civicplus"` —
  uses the real `civic-scraper` library (`LegistarSite` / `CivicPlusSite`).
- `scraper_strategy: "crawl4ai"` — generic LLM-assisted link extraction, used as
  the fallback for every platform civic-scraper doesn't support (NovusAgenda,
  Granicus, bespoke county CMSs, etc.)

**This routing decision is NOT made at runtime.** It's a static field baked into
each county's config record ahead of time by a human, currently in
`config/counties.json` (only 7 counties today). The real chain is:

```
config/counties.json
  → scripts/seed-counties.mjs (writes Firestore `counties` + BigQuery `scrape_roster`)
  → functions/dispatcher/src/dispatcher.ts (reads both, publishes `scrape-jobs`)
  → functions/scraper/src/scrapers.py (`_scrape_civic_sync`, picks LegistarSite vs
    CivicPlusSite from the `platform` field; has a thin URL-string fallback
    heuristic — `"legistar.com" in url`, `"civicplus.com" in url or "AgendaCenter"
    in url` — only used when `platform` is missing, and only within the
    `civic_scraper` strategy already chosen)
```

There is currently **zero automated platform detection** across the rest of the
US. `packages/shared/data/us_locations.json` lists every US county by state
(~3,140 counties, plus parishes/boroughs/census areas for LA/AK) and is the
seed list for this work.

## Step 0 — fix a live bug before scaling this up (do this first)

Tracing the chain above turned up a bug: DEBUG-LOG.md entry #4 claims the
Legistar `timezone` requirement was "Resolved 2026-06-24," but that fix only
reaches `functions/scraper/src/scrapers.py` via `scripts/local_pipeline.py`,
which reads `timezone` directly out of the JSON file and bypasses
Firestore/Pub/Sub entirely. In the real production path:

1. `scripts/seed-counties.mjs:24-35` builds the Firestore county doc WITHOUT a
   `timezone` field — it's silently dropped even though `county.timezone`
   exists in `config/counties.json` for Sonoma/Pima/Milwaukee.
2. `packages/shared/src/models.ts`'s `countyConfigSchema` has no `timezone`
   field declared at all (and per CLAUDE.md, this schema + the TS/Python
   mirrors are the sync-of-truth — they must stay aligned).
3. `packages/shared/src/messages.ts`'s `scrapeJobSchema` also has no
   `timezone` field, so `dispatcher.ts:87-94`'s `publishScrapeJob` never puts
   it in the Pub/Sub message even if it survived step 1.

Net effect: every real Legistar county crashes with
`LegistarSite requires a timezone` in actual production, despite the bug being
marked resolved. Fix this before bulk-populating thousands more counties (a
meaningful fraction of which will be Legistar):

- Add `timezone: z.string().optional()` to `countyConfigSchema` in
  `packages/shared/src/models.ts` and the matching Python pydantic mirror in
  `packages/shared-py/` (check `CLAUDE.md`'s "Sync rule" — keep zod and
  pydantic aligned).
- Add `timezone` to `scrapeJobSchema` in `packages/shared/src/messages.ts`.
- Thread `county.timezone` through `seed-counties.mjs`'s Firestore doc and
  `dispatcher.ts`'s `publishScrapeJob` message construction.
- Update the corresponding JSON Schema contract in
  `packages/shared/contracts/` if one exists for these messages.
- Strike through the DEBUG-LOG.md #4 "Resolved" claim and add a follow-up note
  that the production Pub/Sub path was still broken, with a new resolved date
  once this fix lands. Don't delete the original entry — append, per the
  CLAUDE.md debug-log convention.
- Add/extend a test that seeds a Legistar county and asserts the published
  scrape-job message contains `timezone`.

## Your task: research, then design, then build

Do **not** start writing the bulk-discovery script until Phase 1 and Phase 2
are done and you've shared the design with a one-paragraph summary of your
answers to the open questions below. This is explicitly a research-first task —
the goal is a system whose logic has been thought through, not a fast first
draft.

### Phase 1 — Research

Answer these before designing anything:

**From prior discussion (must answer):**
1. URL discovery strategy: probe common vendor URL patterns first
   (`{slug}.legistar.com`, `{slug}.civicplus.com/AgendaCenter`,
   `{slug}.novusagenda.com/agendapublic/`) since this is free and fast, or
   go straight to a search API? What's the actual hit rate of pattern-probing
   alone — try it against a random sample of ~30 counties from
   `us_locations.json` (mix of large/small, multiple states) before deciding,
   rather than guessing.
2. One-time backfill script vs. a periodic recurring job? Government sites
   occasionally migrate platforms — how would you even detect drift later
   without re-running the full discovery for every county?
3. Confidence / manual-review gate: auto-classification will misfire on dead
   domains, parked pages, counties with no online agenda system at all, or
   pages that mention "agenda" without being an actual meeting-document
   portal. Should the output schema include a `confidence` or `needs_review`
   field rather than writing straight into the same `counties` collection the
   dispatcher trusts unconditionally? (Per CLAUDE.md's "no silent fallbacks" —
   a bad auto-classification silently feeding `civic_scraper` a URL it can't
   parse is exactly the failure class that principle exists to prevent.)
4. Where should this script live? It's a backfill/batch job, not a live
   pipeline component — `scripts/` alongside `local_pipeline.py` and
   `seed-counties.mjs`, not a new Cloud Function.

**Deeper questions (must answer):**
5. **Rate limiting / politeness.** Probing or scraping ~3,140 county websites
   is a lot of outbound traffic to government infrastructure, much of it
   small-county servers with no CDN. What's the concurrency cap, per-host
   delay, and User-Agent string? Should it respect `robots.txt`? This needs
   to look nothing like a DDoS — design the throttling before writing the
   fetch loop, not after.
6. **Long-running job resilience.** At any sane rate limit, classifying 3,140
   counties will take a long time (do the math once you've picked a
   concurrency/delay in Q5). What's the checkpointing strategy so a crash or
   interruption partway through doesn't mean starting over? (e.g. append
   results to a resumable file/log keyed by county_id, skip already-processed
   entries on restart.)
7. **The long tail with no vendor platform.** Many counties — especially
   small ones — won't be on Legistar/CivicPlus/NovusAgenda at all; they'll
   have a static HTML page on their own `.gov` domain, or nothing crawlable.
   `crawl4ai` is the fallback, but should every "fallback" county get a basic
   sanity check (URL returns 200, page text contains something like "agenda"
   or "minutes") before being written as `scraper_strategy: crawl4ai`? Or is
   "found *a* government website" good enough to queue, deferring real
   validation to the first actual scrape attempt? Justify whichever you pick.
8. **BigQuery `scrape_roster` is the dispatcher's actual queue — Firestore
   `counties` alone does nothing.** `loadScrapeRoster()` in `dispatcher.ts`
   only dispatches counties with a `status = 'queued'` row in BigQuery
   `scrape_roster`; `seed-counties.mjs` is the only thing that currently
   writes both stores together. Should the bulk tool write directly to both
   stores like `seed-counties.mjs` does, or write a new
   `local-run/discovered-counties.json` (mirroring `config/counties.json`'s
   shape) for human review, with the actual Firestore/BQ write staying a
   separate, explicit `pnpm seed:counties`-style step? Recommend the latter
   unless you have a strong reason — population data this large going
   straight into the live dispatch queue without a review step is a big blast
   radius for one bad run.
9. **Cost ceiling.** If pattern-probing's hit rate from Q1 isn't high enough
   and a search API is needed for the long tail, what's a sane budget/quota
   before falling back to "leave unmatched counties out of the roster
   entirely, flagged for later manual curation" rather than paying for full
   coverage?
10. **New platforms worth adding real support for.** If discovery surfaces a
    vendor platform beyond Legistar/CivicPlus/NovusAgenda showing up
    frequently (e.g. Granicus), should that get flagged distinctly in the
    output (not lumped into generic `platform: unknown`) so it's visible as a
    candidate for real civic-scraper-equivalent support later, even though
    this task doesn't build that support?

### Phase 2 — Design proposal

Before writing the implementation, write a short plan (a new
`COUNTY_DISCOVERY_PLAN.md` at repo root is fine, or just a detailed PR-style
summary if you prefer) covering:
- Your answers to all 10 questions above, with reasoning.
- The exact output schema per county (field names, types — should mirror
  `CountyConfig` from `packages/shared/src/models.ts` plus whatever
  confidence/review metadata you decided on in Q3).
- The classification heuristic, spelled out precisely (domain string matches,
  page-content checks, in what order, with what fallback).
- How you'll test the heuristic's accuracy before running it at full scale —
  e.g. a hand-labeled sample of ~30-50 counties across different
  states/sizes, checked against ground truth you look up manually, with a
  reported accuracy number. Don't skip this — "looks right" isn't a
  validation step.

Stop and let the human review this plan before proceeding to Phase 3 if
anything in your answers conflicts with existing architecture (check
`CLAUDE.md` "Key Architectural Decisions" and "Failure & Observability
Principles" again before finalizing).

### Phase 3 — Build

Once the design is settled:
1. Implement the discovery/classification script per your design.
2. Implement the validation sample check from Phase 2 and report the actual
   accuracy number achieved.
3. Run it against the full `us_locations.json` list (respecting whatever rate
   limit you designed), with checkpointing so it's safely resumable.
4. Produce the output artifact (review file or direct seed, per your Q8
   answer) plus a short summary: total counties processed, breakdown by
   platform (`legistar` / `civicplus` / `novusagenda` / `unknown→crawl4ai` /
   `no usable URL found`), and how many are flagged `needs_review`.
5. Add tests for the classification heuristic itself (pure function, no
   network) using fixture URLs/HTML snippets covering each platform plus edge
   cases (parked domain, redirect chains, ambiguous text).
6. Gitignore any large raw-output artifacts this produces under `local-run/`,
   following the existing pattern for other scratch directories there.

## Verification

- `pnpm build` passes with zero errors.
- New/changed Python and Node tests pass:
  `cd functions/analyzer && PYTHONPATH=. python3 -m pytest tests/ -v`,
  `cd functions/scraper && PYTHONPATH=. python3 -m pytest tests/ -v`, plus
  whatever test suite covers the new classification heuristic.
- The Step 0 timezone fix is verified with a real test: seed a Legistar
  county, confirm the published scrape-job message includes `timezone`.
- Phase 2's accuracy check on the hand-labeled sample is reported with an
  actual number, not "seems good."
- The full-scale run completes (or is demonstrably resumable mid-run) without
  violating whatever rate limit was designed in Q5 — show evidence (timing
  logs, request counts) that it stayed within it.

## Guardrails

- Follow CLAUDE.md's "Failure & Observability Principles" — no silent
  fallbacks, every external call observable, fail loud rather than guess
  quietly. A misclassified county is a data-quality problem; make it visible
  (Q3's `needs_review` field), don't bury it.
- Don't touch Terraform, don't deploy anything, don't write directly to
  production Firestore/BigQuery without the human's go-ahead on Q8 — default
  to the review-file approach unless told otherwise.
- Don't build real civic-scraper support for a new platform (Q10) — just flag
  it. That's separate, future work.
- Keep this additive: don't change how the existing 7 hand-curated counties in
  `config/counties.json` are handled unless Step 0's timezone fix requires
  touching shared schema files they also rely on.
