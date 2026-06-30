# Handoff — 2026-06-25 session

**Read this first if you're a new Claude Code session picking up Beaver 4.0.** This is a
point-in-time snapshot, not a permanent doc — once you're oriented, the durable record
lives in [TIMELINE.md](TIMELINE.md) (entry "2026-06-25 — Multi-platform scraper
reliability test + embedded-link following") and [DEBUG-LOG.md](DEBUG-LOG.md) (entries
#3–12). Delete this file once you've internalized it, or leave it — it won't go stale
destructively, just become less relevant.

Per [HIERARCHY.md](HIERARCHY.md): read CLAUDE.md, ROADMAP.md, and TIMELINE.md's recent
entries before touching code, if you haven't already this session.

## What just happened

Two things, in order:

1. **Proved the scraper reliably works across all 3 platform types** (CivicPlus,
   Legistar, crawl4ai-as-catchall) by adding 5 new real counties and running the full
   pipeline against 7 total, twice independently, fixing 8 real bugs along the way.
2. **Built embedded-link following**, because inspecting the real downloaded PDFs showed
   Legistar agendas are mostly a thin shell linking out to the actual attachment
   documents — the pipeline was never following those links, so it was missing most of
   the substantive content. Production had a half-built, untested, unfiltered attempt at
   this; replaced it with a filtered, shared, tested version wired into both production
   and the local test harness.

Full detail is in TIMELINE.md/DEBUG-LOG.md. The short version of what changed:

| File | What changed |
|------|--------------|
| `config/counties.json` | +5 counties: Denton TX, Centre PA (CivicPlus); Pima AZ, Milwaukee WI (Legistar); Brazos TX (NovusAgenda/crawl4ai) |
| `functions/scraper/src/scrapers.py` | Legistar `asset_list=["Agenda"]` workaround; broadened `DOCUMENT_LINK_PATTERN`; new `extract_embedded_links()` |
| `functions/scraper/src/main.py` | Wired `extract_embedded_links()` in (replacing old unfiltered version); added magic-byte validation on downloads (`_looks_like_document`) |
| `functions/analyzer/src/main.py` + new `errors.py` | `extract_text()` now raises `DoclingExtractionError` instead of silently mocking, unless `MOCK_MODE=true` |
| `scripts/local_pipeline.py` | Refactored per-document logic into `_process_one_document()`; added embedded-link recursion (1 level), magic-byte check, 240s Docling timeout |
| `functions/scraper/tests/test_embedded_links.py`, `functions/analyzer/tests/test_main.py` | New, 10 tests total |

All 23 Python tests pass, `pnpm build` is green.

## Repo state right now

```
git status
```
shows these modified/new (uncommitted as of this handoff):
- Modified: `DEBUG-LOG.md`, `TIMELINE.md`, `config/counties.json`, `functions/analyzer/src/main.py`,
  `functions/scraper/src/main.py`, `functions/scraper/src/scrapers.py`, `scripts/local_pipeline.py`
- New: `functions/analyzer/src/errors.py`, `functions/analyzer/tests/test_main.py`,
  `functions/scraper/tests/test_embedded_links.py`, `config/classifier-golden-set.json`,
  `OPUS_RESEARCH_PROMPT.md`, `cursor-prompt-local-sandbox.md`
- New, untracked, gitignore-eligible: `local-run/raw/{az-pimacounty,pa-centrecounty,sonoma-county,tx-brazoscounty,tx-dentoncounty,wi-milwaukeecounty}/`
  and matching `local-run/staging/` dirs — real downloaded test PDFs + extracted chunks
  from this session's validation runs. Safe to delete; they're scratch artifacts, not
  committed (`local-run/` is gitignored already for the cache dirs but these specific
  county subdirs are new and currently untracked, not ignored — check `.gitignore` if
  you want them excluded going forward).

**Nothing has been committed.** That's a deliberate choice from this session — the user
hadn't asked for a commit. If you're continuing this work, check with the user before
committing, per repo convention (only commit when explicitly asked).

## Known gaps — real, not hidden, intentionally not fixed this session

1. **crawl4ai's link pattern over-matches.** `DOCUMENT_LINK_PATTERN` matches "agenda"
   anywhere in a URL, including path prefixes like `/agendapublic/Meetings.aspx` which
   are navigation, not documents. Harmless today — the magic-byte check catches and
   skips these before they reach Docling — but it means a few wasted download attempts
   per run. Low priority.

2. **Docling cannot parse legacy pre-2007 binary Office files** (`.doc`/`.xls`/`.ppt` —
   OLE Compound File signature `\xd0\xcf\x11\xe0`). Found via Centre County PA. Handled
   correctly (clear error, skip, continue) but not actually supported. Would need a
   separate extractor (e.g. `olefile` or a LibreOffice headless conversion step) ahead of
   Docling. Not attempted — no county tested has this as a meaningful fraction of
   documents. See DEBUG-LOG.md #12.

3. **Embedded-link following is one level deep only.** An attachment's own embedded
   links aren't chased. Deliberate scope choice (recursion/runaway-download risk), not
   validated against the user as a permanent decision — flag it if it matters for the
   product.

4. **Brazos County's NovusAgenda endpoint has real intermittent flakiness** — one
   document link stalled mid-download on both validation runs. The system recovers by
   trying the next candidate link (it has 13), so it never actually failed end-to-end,
   but if a similar platform only exposed one candidate link, this would be a real
   failure mode worth a retry-with-backoff, not just "try the next one."

5. **Production still has no hard timeout on Docling extraction itself** — only the
   local test harness does (240s, via `asyncio.wait_for`). A pathological Docling hang
   (observed once this session, 16+ min, never fully root-caused) would currently be
   bounded only by Cloud Run's own platform-level request timeout in production, not by
   anything in our code. If you want this closed, port the same timeout pattern from
   `scripts/local_pipeline.py`'s `_process_one_document()` into
   `functions/analyzer/src/main.py`'s `process_document()`.

6. **`local_pipeline.py` is the test harness, not production.** Fixes were ported to
   both where they overlap (scrapers.py, analyzer's main.py), but double-check before
   assuming any given fix automatically applies to the real Cloud Run services — verify
   by reading `functions/scraper/src/main.py` / `functions/analyzer/src/main.py`
   directly, not just the test harness.

## Useful commands

```bash
# Full multi-county test matrix (the one this session built and ran repeatedly)
LOCAL_MAX_DOCS_PER_COUNTY=3 .venv/bin/python scripts/local_pipeline.py

# Just the Python test suites
cd functions/analyzer && PYTHONPATH=. ../../.venv/bin/python3 -m pytest tests/ -v
cd functions/scraper && PYTHONPATH=. ../../.venv/bin/python3 -m pytest tests/ -v

# Full build
pnpm build
```

## If the user's next ask is...

- **"Commit this"** → it's all real, tested, working code — safe to commit as-is. Group
  logically (e.g. one commit for the platform-reliability fixes, one for embedded-links)
  or one commit for the whole session — ask if unsure which they want.
- **"Deploy it"** → nothing in this session touched Terraform or did a real deploy. The
  fixes are in shared library code (`scrapers.py`, analyzer's `main.py`) that production
  Cloud Run services import directly, so they'd take effect on next deploy — but this
  hasn't been deployed or tested against live GCP infra this session.
- **"Keep going on reliability"** → gap #5 (production Docling timeout) and gap #2
  (legacy Office format support) are the two most concrete next pieces of real work.
- **Anything about embedded links going deeper / recursive** → gap #3 is where to start.
