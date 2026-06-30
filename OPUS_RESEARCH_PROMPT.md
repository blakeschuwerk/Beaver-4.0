# Research Prompt: Autonomous Bug Fix for Beaver 4.0 Chunking + Fine-Tuning Infrastructure

This repository contains a government document processing pipeline. You are an autonomous agent tasked with fixing three interconnected issues discovered during testing. This is a research scenario — you have full autonomy to make changes, run tests, and validate your work. Use your full thinking capability to reason through the problems and solutions.

## Context: What Beaver Does

The pipeline scrapes government meeting documents (agendas, packets, minutes) to identify infrastructure projects. Documents flow through:
1. **F2 Scraper** — downloads PDFs
2. **F3 Analyzer** — extracts text with Docling, chunks it with `hybrid_chunk_from_markdown()`
3. **F4 Classifier** — runs each chunk through an LLM to classify `is_project: true/false`
4. **F5 Personalization** — scores relevance of projects against user profiles

The testing console (localhost:8080) lets you run a single document through the pipeline end-to-end, inspect each step's trace, and iterate without hitting production or cloud resources.

---

## Problem 1: Chunking False Positives (Critical)

### Symptom
A single test run of a Nash County agenda PDF (34 child chunks) produced **8 chunks flagged as projects**, but 5 were clearly wrong:
- Bare template header: `"## Commissioner's Agenda Information Sheet"` (no body)
- Meeting title: `"## June 15, 2026 Second Regular Monthly Board Meeting"`
- Signature-line divider: `"____________________________________________________________"` (all underscores)
- Other boilerplate headers

The LLM classified these as projects with `confidence: 0.7`, fabricating budget/niche details on pure hallucination because it had **zero real content to reason about**.

### Root Cause
`functions/analyzer/src/chunking.py` — specifically the `hybrid_chunk_from_markdown()` function — filters child paragraphs only by **length** (`if len(para) < 40: continue`), never by **content quality**. When a markdown heading sits alone (separated by blank lines from its body), it:
1. Passes the 40-char length filter (e.g., `"## Commissioner's Agenda Information Sheet"` is 44 chars)
2. Gets emitted as its own isolated child chunk
3. Reaches the classifier with zero surrounding context
4. The LLM guesses `is_project=true` rather than `false` — a tragic but predictable failure mode

### Fix Strategy
**Two defenses, both in chunking.py, both before the LLM ever sees the chunk:**

1. **Orphan heading merge:** If a paragraph is a markdown heading (`starts with #`) with no body following it in the section, merge it forward into the next real paragraph instead of emitting it alone. This gives the heading context (the project it belongs to) so the LLM has something real to reason about.

2. **Noise paragraph filter:** Drop paragraphs that are mostly punctuation/whitespace (e.g., signature-line dividers, table borders). Use an alphanumeric-character ratio threshold — if less than 30% of the paragraph is alphanumeric characters, it's structural noise with no semantic content; drop it.

### Evidence of Fix Working
A separate validation tested the merged chunks:
- Chunk: `"## Commissioner's Agenda Information Sheet\n\nElm Street Drainage Project CDBG - Disaster Recovery Project Ordinance Nikki Stanton, Finance Officer"`
- Result: `is_project=true, niche_tags=["drainage"], location="Elm Street", confidence=0.8` ✓ (correct)
- Chunk: `"## Commissioner's Agenda Information Sheet\n\nDescription of the actual agenda item content goes here..."`  
- Result: `is_project=false, confidence=0.7` ✓ (correct)

The merge itself does **not** dilute or suppress true positives.

### Validation Strategy
A **golden-set** of labeled examples has been seeded (`config/classifier-golden-set.json`) with:
- 2 real projects (drainage + school capital)
- 1 legitimate prose chunk (Juneteenth narrative)
- 1 merged chunk (header + real project body) — should pass with the fix
- 4 isolated fragments (bare headers, noise) — these test the classifier prompt as a backstop (currently fail, and that's OK — chunking should prevent them from ever reaching the classifier in the real pipeline)

After your chunking fix, run: `pnpm classify:eval` — you should see **at least 4/8 pass** (the real-world cases).

---

## Problem 2: Silent Mock Fallback in Dev Scripts (High Priority)

### Symptom
`scripts/local-classify.mjs` has a critical bug: it imports `classifyChunk` and `scoreRelevance` at the **top of the file** (before `.env.local` is loaded), so their module-level `MOCK_MODE` constants freeze at import time as `true`, regardless of what `.env.local` actually says.

**Result:** Every call to `pnpm local:classify` silently mocks all LLM calls, writes fabricated project data to `local-run/projects.jsonl`, and reports success — you'd never know it's fake.

This is the same class of bug that caused the production incident (silent fallback hiding failures) — see `DEBUG-LOG.md` #1.

### Fix
Move the imports of `classifyChunk` and `scoreRelevance` to **after** the `loadEnvLocal()` call, using dynamic `await import()`. This forces re-evaluation of the module-level constants after the environment is loaded.

Same fix applies to any other script that imports from `functions/classifier/dist/llm-client.js` or `functions/personalization/dist/personalization.js` before loading `.env.local`.

---

## Problem 3: Fine-Tuning Infrastructure (Medium Priority)

The chunking fix is expensive to iterate on locally because:
1. **Docling extraction** takes ~100-120s per document (a constant cost)
2. **Classification** then takes ~4s per chunk × N chunks (variable)
3. A single test run = 2-3 minutes just to see if your one-line chunking change worked

### Solution: Three-Layer Caching + Validation Harness

Build these (they're scaffolding, not core fixes, but they make iteration fast):

#### Layer 1: Extraction Cache
In `functions/analyzer/src/sandbox_extract.py`, cache `extract_text()` output keyed by file content hash to `local-run/extract-cache/<hash>.json`. Subsequent runs re-chunk fresh (milliseconds) against your edited `chunking.py` without re-running Docling.

#### Layer 2: Single-Chunk Classify CLI
`scripts/classify-one.mjs` — takes one chunk of text as an argument and runs it through the real classifier, printing the result. One ~4s LLM call instead of a full pipeline. Used for debugging specific chunks.

#### Layer 3: Golden-Set Regression Eval
`scripts/classify-eval.mjs` — runs every example in `config/classifier-golden-set.json` through the classifier, reports pass/fail + accuracy %. Turns "looks better" into a number.

Wire them into `package.json`:
```json
"classify:one": "node scripts/classify-one.mjs",
"classify:eval": "node scripts/classify-eval.mjs"
```

#### Testing Console Hardening
The testing console already works, but harden it:
1. Add `LLM_LOCAL_ONLY=true` to `.env.local` — fail immediately if someone accidentally points at a non-localhost LLM endpoint while in local dev mode
2. Extend trace output to include per-step **timing** (milliseconds) — currently missing, needed for calibration work
3. Add a **run history page** — currently traces are lost on server restart; persist them to a local NDJSON log so you can see patterns across multiple runs

---

## Your Task

Fix all three problems in order:

### Step 1: Fix the Chunking Bug (critical)
- Edit `functions/analyzer/src/chunking.py`
- Implement `_is_heading_paragraph()` and `_is_noise_paragraph()` helper functions
- Refactor `hybrid_chunk()` and `hybrid_chunk_from_markdown()` to use a unified `_emit_children()` that merges orphan headings forward and drops noise
- Run the existing unit tests: `cd functions/analyzer && PYTHONPATH=. python3 -m pytest tests/test_chunking.py -v`
- Add 3 new unit tests:
  - `test_orphan_heading_is_merged_not_standalone()` — bare heading + real body should produce 1 child chunk (merged)
  - `test_trailing_orphan_heading_with_no_body_is_dropped()` — heading with nothing after it should produce 0 children
  - `test_noise_paragraph_is_dropped()` — punctuation dividers should be skipped

### Step 2: Fix the Silent-Mock Bug (high priority)
- Edit `scripts/local-classify.mjs`
- Move imports of `classifyChunk` and `scoreRelevance` to use dynamic `await import()` **after** `loadEnvLocal()`
- Test: `pnpm build && pnpm local:demo && pnpm local:classify` — confirm real multi-second latencies in the output logs (look for `"latency_ms": 3000+`), not instant 0ms calls

### Step 3: Build the Fine-Tuning Infrastructure (medium priority, can partially defer)
- **sandbox_extract.py**: Add extraction caching with file-hash key
- **classify-one.mjs**: New script for single-chunk testing
- **classify-eval.mjs**: Golden-set regression runner
- **config/classifier-golden-set.json**: Seed with labeled examples (provided below)
- **package.json**: Wire up the new scripts
- **Update .env.local**: Add `LLM_LOCAL_ONLY=true` (env loader already handles this)
- **Update .gitignore**: Add `local-run/extract-cache/`

### Step 4: Verify the Fix
- `pnpm build` — full build passes
- `cd functions/analyzer && PYTHONPATH=. python3 -m pytest tests/ -v` — all tests pass, including new ones
- `pnpm classify:eval` — golden-set eval runs, at least 4/8 pass (the real-world cases)
- Test the console: upload one of the Nash County example agendas through localhost:8080, confirm ≤3 projects extracted (not 8), and they look correct
- Bonus: `pnpm local:classify` produces real LLM logs, not 0ms mock calls

---

## Golden-Set Labeled Examples (for validation)

```json
{
  "examples": [
    {
      "id": "nash-drainage-real",
      "text": "Elm Street Drainage Project CDBG - Disaster Recovery Project Ordinance Nikki Stanton, Finance Officer",
      "expected_is_project": true,
      "note": "Real project — named drainage capital work with assigned officer"
    },
    {
      "id": "nash-school-capital-real",
      "text": "Southern Nash Middle School Capital Project Ordinance Amendment Nikki Stanton, Finance Officer",
      "expected_is_project": true,
      "note": "Real project — named capital improvement ordinance"
    },
    {
      "id": "nash-juneteenth-prose",
      "text": "Juneteenth, a combination of the words 'June' and 'nineteenth,' commemorates June 19, 1865, when Union Major General Gordon Granger announced General Order No. 3...",
      "expected_is_project": false,
      "note": "Real prose but not infrastructure — should correctly skip"
    },
    {
      "id": "nash-header-merged-with-body",
      "text": "## Commissioner's Agenda Information Sheet\n\nElm Street Drainage Project CDBG - Disaster Recovery Project Ordinance Nikki Stanton, Finance Officer",
      "expected_is_project": true,
      "note": "What the fixed chunking produces — header + real body merged. Should pass with the fix."
    },
    {
      "id": "fragment-bare-meeting-title",
      "text": "## June 15, 2026 Second Regular Monthly Board Meeting",
      "expected_is_project": false,
      "regression_layer": "classifier-prompt (not chunking)",
      "note": "Isolated heading, unreachable via fixed chunking (would be merged forward). Kept as backstop test."
    },
    {
      "id": "fragment-bare-agenda-header",
      "text": "## Commissioner's Agenda Information Sheet",
      "expected_is_project": false,
      "regression_layer": "classifier-prompt (not chunking)",
      "note": "Same — isolated template, unreachable via fix, backstop test"
    },
    {
      "id": "fragment-underscore-noise",
      "text": "____________________________________________________________",
      "expected_is_project": false,
      "regression_layer": "classifier-prompt (not chunking)",
      "note": "Pure punctuation. The chunking fix's noise filter drops this. Backstop test."
    }
  ]
}
```

---

## Important Context

- **Repository structure:** Monorepo with `packages/shared/`, `functions/{dispatcher,scraper,analyzer,classifier,personalization,api}`, `apps/frontend/`
- **Local dev:** `.env.local` controls mock vs real LLM; `pnpm build` compiles all workspaces; `pnpm dev:api` starts the testing console on port 8080
- **Architecture principle:** Every external call must be observable + fail loud in production (no silent fallback). Mock mode is **only** for local development and explicitly gated on `LLM_MOCK_MODE=true` / `MOCK_MODE=true`. See `CLAUDE.md` "Failure & Observability Principles."
- **Logging:** Structured events via `logEvent()` from `@beaver/shared` go to `local-run/errors.ndjson` (read with `pnpm logs:errors`)
- **Related incident:** `DEBUG-LOG.md` #1 describes the original silent-fallback production bug that motivated these hardening fixes

---

## Success Criteria

✓ All unit tests pass (including 3 new chunking tests)  
✓ `pnpm classify:eval` shows ≥4/8 golden-set examples passing  
✓ Testing console produces 0-3 projects for Nash County test documents, with correct niche/location data (not fabricated)  
✓ `pnpm local:classify` logs show real multi-second latencies, not instant 0ms mocks  
✓ No new build errors or type mismatches  

---

## Notes for the Autonomous Agent

- You have full autonomy. Use your thinking mode to reason through the architectural implications of each change.
- The golden-set is designed to catch both false positives (the chunking bug) and false negatives (over-filtering). It's not a complete ground-truth dataset; it's a regression check.
- If you find yourself unsure about a design decision, default to the principle: **fail loud, never silent**. Silence killed the production run; visibility saves it.
- Don't over-engineer. The fine-tuning infrastructure (#3) is scaffolding for local iteration, not production-facing. Keep it simple.
- If you hit a blocker, leave a clear diagnostic in the code (comments or a new `BLOCKING_ISSUES.md` file) so the human can understand where you got stuck and why.
