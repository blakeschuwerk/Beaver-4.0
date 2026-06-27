# Beaver 4.0 — Debug Log

Quick-reference list of discrete bugs/issues, separate from TIMELINE.md's broader
session narratives. Check here first when something feels like it might be a known
issue — faster to scan than TIMELINE.md or ROADMAP.md.

**Convention:** add a numbered entry when you identify a real issue. When it's fixed,
strike through the symptom and append **Resolved [date]** plus a one-line summary of
the fix. An entry with no strikethrough is open. If it's been open a long time with no
related commits, it may have been abandoned, not actually fixed — say so rather than
assuming.

---

1. **Production Cloud Scheduler cron hammers a slow/failing RunPod endpoint; failures
   were invisible because the classifier silently wrote mock data.** **PAUSED + made
   loud 2026-06-24; RunPod root cause still open.**
   - **Mitigation 1 (cron):** disabled `beaver-dispatcher-tick` via `pnpm cron:pause`
     (reversible with `pnpm cron:resume`). It fired `0 */6 * * *` and ran the full
     pipeline against the real RunPod Qwen 2.5 7B endpoint (`LLM_MOCK_MODE=false`).
   - **Mitigation 2 (visibility — the real lesson):** Gemini's log analysis of the
     18:00 UTC run showed the failure mode was **not** a request-shape error. RunPod was
     responding in 110+ seconds (past the 30s timeout); each timeout aborted the fetch
     and the classifier **silently fell back to mock classification and returned HTTP
     200**, writing fabricated data to BigQuery. That silent fallback is why "68 failed
     requests" went unnoticed. ~~Fixed~~ **Resolved 2026-06-24** — removed the
     production silent fallback in both LLM clients
     ([functions/classifier/src/llm-client.ts](functions/classifier/src/llm-client.ts),
     [functions/personalization/src/llm-client.ts](functions/personalization/src/llm-client.ts)):
     mock now runs only when `LLM_MOCK_MODE=true`; otherwise a failed call throws
     `LlmUnavailableError`, the handler returns 500, and the message dead-letters. Added
     structured outbound logging (`logEvent`) + `pnpm logs:errors` so the next run's real
     RunPod status codes are readable without a vendor console.
   - **Still open (RunPod latency):** *why* RunPod takes 110+ seconds — cold start,
     quota, or credits — is undiagnosed. Strategy is "diagnose first": resume the cron
     only after a real run captures RunPod status codes via `pnpm logs:errors --prod` and
     the latency cause is understood. *Discovered 2026-06-24.*

2. **BigQuery `projects` MERGE serialization race under concurrent classifier writes.**
   The same 18:00 UTC run logged one HTTP 500: `Could not serialize access to table
   beaver4:beaver_pipeline.projects due to concurrent update`. Concurrent classifier
   invocations MERGE-upsert the same table near-simultaneously; BQ rejects the colliding
   transaction. This is the same race that produced the duplicate `proj-nc-nashcounty-2024-042`
   rows (see TIMELINE.md 2026-06-24). **Open** — orthogonal to #1, deferred to a dedicated
   pass (needs a dedup step or per-tracking-number write serialization in F4 before
   Phase 6/7 rely on exact row counts). *Discovered 2026-06-24.*

3. **Chunking false positives: bare markdown headers and punctuation dividers
   classified as projects with fabricated data.** A Nash County agenda test run
   produced 8 `is_project=true` chunks; 5 were boilerplate (e.g.
   `"## Commissioner's Agenda Information Sheet"` with no body) or a pure
   underscore divider line — the LLM had zero real content to reason about and
   guessed. ~~Open~~ **Resolved 2026-06-24** — [functions/analyzer/src/chunking.py](functions/analyzer/src/chunking.py)
   filtered children by length only, never content quality. Added
   `_is_heading_paragraph()` (merges an orphan heading forward into the next
   real paragraph instead of emitting it standalone) and `_is_noise_paragraph()`
   (drops paragraphs that are mostly punctuation, e.g. signature-line
   dividers, via an alphanumeric-ratio threshold). Verified on a second,
   independently-scraped agenda: 8 false positives → 0, the 2 real projects
   still classified correctly. 3 regression tests added.

4. **`civic_scraper`'s `LegistarSite` requires an explicit `timezone` —
   omitting it crashes every single event.** Sonoma County (Legistar) returned
   zero documents; the underlying exception was swallowed down to a bare
   `"None"` by a generic handler. Real traceback: `pytz.timezone(self.TIMEZONE)`
   where `TIMEZONE` was never set, since `LegistarSite(url)` was constructed
   with no `timezone` kwarg. ~~Open~~ ~~**Resolved 2026-06-24**~~ — added
   `timezone` to county config, threaded it through
   `scrape_for_strategy()` → `scrape_civic_scraper_real()` → `_scrape_civic_sync()`
   in [functions/scraper/src/scrapers.py](functions/scraper/src/scrapers.py),
   and raise a clear `ValueError` if a Legistar county is configured without
   one (fail loud instead of a bare library exception). ~~**Follow-up (still open
   2026-06-24):** that fix only reached the scraper via
   `scripts/local_pipeline.py`, which reads `timezone` directly from
   `config/counties.json`. The production path still dropped it:
   `countyConfigSchema` / `scrapeJobSchema` had no `timezone` field,
   `scripts/seed-counties.mjs` omitted it from Firestore docs, and
   `dispatcher.ts` never put it in Pub/Sub scrape-jobs — so every real Legistar
   county still crashed in production.~~ **Resolved 2026-06-27** — added
   `timezone` to shared zod/pydantic schemas + `scrape-job.json` contract,
   threaded through `seed-counties.mjs` and `publishScrapeJob()` /
   `buildScrapeJobMessage()` in [functions/dispatcher/src/dispatcher.ts](functions/dispatcher/src/dispatcher.ts);
   dispatcher test asserts Legistar counties publish `timezone` in scrape-jobs.

5. **Same `civic_scraper` Legistar library raises `KeyError: 'Minutes'` on
   counties where some events have no minutes published yet.** Pima County AZ
   failed with `civic-scraper failed for https://pima.legistar.com: 'Minutes'`.
   `LegistarSite.scrape()` defaults to `asset_list=["Agenda", "Minutes"]` and
   wraps each asset-type lookup in `try/except TypeError` — but a *missing*
   dict key raises `KeyError`, not `TypeError`, so the guard doesn't catch it
   and the whole scrape crashes. ~~Open~~ **Resolved 2026-06-25** — pass
   `asset_list=["Agenda"]` explicitly for `LegistarSite` in `_scrape_civic_sync()`,
   sidestepping the buggy code path entirely. Also matches Beaver's actual
   focus (agendas surface projects in early planning; minutes are
   retrospective, lower value per CLAUDE.md's lifecycle-stage model).

6. **crawl4ai document-link filter missed platforms that serve PDFs through a
   dynamic handler with no `.pdf` in the URL.** Brazos County TX (NovusAgenda)
   returned 0 candidate links despite `crawl4ai` correctly fetching the page —
   the real document links look like
   `DisplayAgendaPDF.ashx?MinutesMeetingID=1898`, and the existing filter
   (`if '.pdf' in href.lower()`) only matches literal `.pdf` URLs. ~~Open~~
   **Resolved 2026-06-25** — added `DOCUMENT_LINK_PATTERN` in
   [functions/scraper/src/scrapers.py](functions/scraper/src/scrapers.py)
   matching real file extensions OR agenda/minutes/packet keywords in the
   path, applied at both link-collection points in `scrape_crawl4ai_real()`.
   Known minor over-match: the pattern also matches navigation links whose
   *path prefix* happens to contain "agenda" (e.g. `/agendapublic/Meetings.aspx`)
   — harmless in practice since the magic-byte check (#7) catches and skips
   these before they reach extraction, but a tighter pattern would avoid the
   wasted download attempts. Not fixed — low priority, system already
   self-heals via the next candidate link.

7. **A stalled/truncated HTTP response (200 OK, correct `content-type`, but
   the byte stream never completes) was fed straight into Docling, producing
   an opaque `PdfiumError: Data format error` deep in a third-party
   traceback instead of a clear, fast, attributable failure.** Confirmed via
   direct reproduction against Brazos County's `DisplayAgendaPDF.ashx`
   endpoint: `status: 200`, `content-type: application/pdf`, but
   `resp.read()` timed out after 30s with a partial body. ~~Open~~ **Resolved
   2026-06-25** — [scripts/local_pipeline.py](scripts/local_pipeline.py) now
   checks the downloaded bytes' file signature (`%PDF-` or `PK\x03\x04` for
   DOCX) immediately after download and skips with a clear warning if it
   doesn't match, instead of handing garbage to Docling.

8. **Docling can hang indefinitely on some input with zero network activity
   and zero progress output — observed 16+ minutes of continuous 100%+ CPU
   before being killed manually.** Far past the ~300s ceiling seen on the
   largest legitimate real documents tested. Root cause not fully isolated
   (a third-party OCR/layout-detection pathological case, not reproduced on a
   second attempt against the same county). **Open, but contained** — added a
   hard 240s timeout around the extraction call in
   [scripts/local_pipeline.py](scripts/local_pipeline.py) via
   `asyncio.wait_for(asyncio.to_thread(extract_text, ...))`, so one bad
   document can no longer stall an entire multi-county test run. Does not
   apply to the production Cloud Run analyzer service, which already has its
   own platform-level request timeout. *Discovered 2026-06-25.*

9. **`extract_text()` silently substituted fabricated mock text on ANY Docling
   failure, regardless of `MOCK_MODE`.** Surfaced directly by #7/#8 above: a
   corrupted Brazos County download triggered Docling's `except Exception`
   handler, which unconditionally returned `extract_mock_text()` and continued
   as if successful — the exact silent-fallback anti-pattern entry #1 in this
   log was about, just at the extraction layer instead of the LLM layer.
   ~~Open~~ **Resolved 2026-06-25** — added
   [functions/analyzer/src/errors.py](functions/analyzer/src/errors.py)'s
   `DoclingExtractionError` (mirrors `functions/scraper/src/errors.py`'s
   `StructuralScrapeError` convention); `extract_text()` now only falls back
   to mock when `MOCK_MODE=true`, otherwise raises and lets the existing
   Flask handler's catch-all return a 500. 4 new tests cover both branches.

10. **`scripts/local_pipeline.py`'s dual-package module loader collided on
    `src.errors` once analyzer gained its own `errors.py`.** Both
    `functions/scraper/src/` and `functions/analyzer/src/` use the generic
    top-level package name `src`, and the loader registers each submodule
    into the global `sys.modules` under that name — so analyzer's
    `from src.errors import DoclingExtractionError` (added for #9) resolved
    to scraper's already-cached `src.errors` instead, raising `ImportError`.
    The script already had a one-off workaround for this exact collision
    pattern for `src.chunking`. ~~Open~~ **Resolved 2026-06-25** — generalized
    the existing per-module `sys.modules` override into a small loop covering
    both `chunking` and `errors`, so future same-named modules need one line
    added, not a new workaround.

**Test matrix established this session (2026-06-25):** added 5 new real
counties to [config/counties.json](config/counties.json) — Denton County TX
and Centre County PA (CivicPlus), Pima County AZ and Milwaukee County WI
(Legistar), Brazos County TX (NovusAgenda via crawl4ai, not civic-scraper-
supported). Two independent full-matrix runs both produced 7/7 successful
document extractions across all three platform types. `pnpm local:scrape-extract`
(or `LOCAL_MAX_DOCS_PER_COUNTY=N .venv/bin/python scripts/local_pipeline.py`)
exercises the whole matrix.

11. **Agenda/packet PDFs were never checked for embedded links to the actual
    attachment documents — the pipeline only ever saw the thin agenda shell.**
    Inspecting real downloaded PDFs from this session's test counties showed
    Legistar agendas are full of `gateway.aspx?M=F&ID=...pdf` links pointing
    at the real ordinances/staff-reports/packets (Pima: 105 links, Sonoma: up
    to 28, Milwaukee: 5 including `.pptx` attachments) — none of which were
    ever followed. Production *had* a half-built version of this
    (`extract_pdf_links()` in `functions/scraper/src/main.py`) but it grabbed
    the **first 5 links completely unfiltered**, which in real data means
    Zoom/Teams meeting links, calendar pages, and unrelated reference sites
    ahead of any real document — and it was never wired into the local test
    harness, so it had never actually been exercised. ~~Open~~ **Resolved
    2026-06-25** — added `extract_embedded_links()` to
    [functions/scraper/src/scrapers.py](functions/scraper/src/scrapers.py),
    reusing `DOCUMENT_LINK_PATTERN` (now broadened to cover `.ppt(x)`/`.xls(x)`
    too — real Milwaukee packets embed `.pptx` attachments) to filter out the
    non-document noise instead of blindly taking the first N links. Wired into
    both the production handler
    ([functions/scraper/src/main.py](functions/scraper/src/main.py)) and the
    local test harness ([scripts/local_pipeline.py](scripts/local_pipeline.py),
    refactored into a shared `_process_one_document()` helper so top-level and
    embedded links go through identical download/validate/extract/chunk
    logic, one level deep). Verified against real data: Pima County and
    Milwaukee County both correctly followed 2 real embedded attachment links
    each, reproducibly across 2 separate runs (21/21 documents both times).
    6 new unit tests cover the filter (real links pass, Zoom/Teams/calendar
    links excluded, dedup, limit).

12. **Docling cannot process legacy pre-2007 binary Office formats
    (`.doc`/`.xls`/`.ppt` — OLE Compound File Binary Format, signature
    `\xd0\xcf\x11\xe0`).** Surfaced by #11's validation: a Centre County
    "Minutes" link (URL has no file extension) returned a real, valid legacy
    `.doc`-format file, correctly identified as non-corrupted by the
    signature check, but Docling's own format detection rejected it —
    `File format not allowed`, since Docling's supported `InputFormat` list
    only includes the modern XML-based `docx`/`pptx`/`xlsx`, not their legacy
    binary predecessors. **Open, low priority** — the system already handles
    this correctly (clear, specific, attributable error; document skipped;
    run continues), so there's no reliability risk, just a coverage gap.
    Fixing it for real would mean a separate legacy-format text extractor
    (e.g. `olefile`-based or a LibreOffice headless conversion step) ahead of
    Docling for files that fail format detection — not attempted, deferred
    until a real county is found where this is a major fraction of documents
    (rare in the platforms tested so far, since most counties have migrated
    off the legacy formats). *Discovered 2026-06-25.*
