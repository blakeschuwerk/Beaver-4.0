# County Platform Discovery Plan

Design proposal for bulk county platform discovery across ~3,142 US counties.
See the approved plan in `.cursor/plans/county_discovery_design_fd36db2a.plan.md`
for full research answers (Q1–Q10), output schema, classification heuristic,
and guardrails.

## Validation results (2026-06-25)

- **Ground-truth sample:** 40 manually verified counties in
  `scripts/county_discovery/ground_truth.json`
- **Heuristic accuracy:** **50.0%** (20/40) — platform correct AND URL
  reachable. Report: `local-run/county-discovery/validation-report.json`
- **30-county pattern-probe hit rate:** **53%** (16/30 found a vendor
  platform; 14 flagged `needs_review` / no usable URL). Breakdown:
  civicplus 6, legistar 4, novusagenda 3, escribe 3, unknown 14.
- **Rate limiting evidence (30-county sample):** 1,339 requests in 57.7s
  (~23 req/s global with Semaphore(8); per-host 0.5–1s jitter).

## Full-scale run (2026-06-25)

- **Total counties processed:** 3,142
- **Platform breakdown:**
  - civicplus: 522
  - novusagenda: 197
  - legistar: 157
  - escribe: 110
  - unknown (no usable URL): 2,156
- **needs_review:** 2,202
- **Probe stats:** 159,051 requests in 6,136.6s (~26 req/s global,
  Semaphore(8), ~102 min wall time)
- **Output:** `local-run/discovered-counties.json` (review file)
- **Checkpoint:** `local-run/county-discovery/results.ndjson` (resumable;
  re-run `pnpm discover:counties` to skip already-processed counties)

## Key heuristic insight

Vendor wildcard subdomains (especially `{slug}.legistar.com` and
`{slug}.novusagenda.com`) return HTTP 200 with thin generic shells. Real
portals are distinguished by **body size ≥ 5,000 bytes** plus platform
content markers. Fake Legistar shells return `"Invalid parameters!"` (19 B).

## Output artifacts

| Path | Purpose |
|------|---------|
| `local-run/county-discovery/results.ndjson` | Resumable per-county checkpoint (gitignored) |
| `local-run/discovered-counties.json` | Human-review file (mirrors `config/counties.json` + metadata) |
| `local-run/county-discovery/summary.json` | Run totals and platform breakdown |

## Seeding discovered counties

Discovery writes to the review file only. After human curation, copy approved
rows into `config/counties.json` and run `pnpm seed:counties`.
