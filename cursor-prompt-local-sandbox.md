# Cursor prompt — local-only sandbox hardening

Paste everything below into Cursor.

---

## Context

Beaver 4.0's admin testing console (`functions/api/src/sandbox/pipeline.ts`,
`apps/frontend/src/pages/AdminInputPage.tsx`, `AdminTracePage.tsx`) already runs a
single document through extraction → classification → relevance scoring as plain
in-process function calls — no Pub/Sub, no BigQuery. When `functions/api` is started
with `pnpm dev:api`, `preload-env.mjs` loads `.env.local`, which already points
`LLM_ENDPOINT_URL` at a local Ollama instance (`http://localhost:11434`) instead of
production RunPod. So single-document sandbox testing is already architecturally
local. Do NOT add a mock BigQuery or mock Pub/Sub layer — confirmed unnecessary,
out of scope.

Three gaps remain. Implement all three. Keep every change additive and reversible —
no changes to production classifier/personalization deploy behavior, no new required
env vars for existing flows.

## 1. Hard guarantee that local-mode runs never call a remote LLM endpoint

In `functions/api/src/sandbox/pipeline.ts`, before `runSandboxPipeline` makes any
LLM call, add a guard: if `process.env.LLM_LOCAL_ONLY === 'true'` and
`process.env.LLM_ENDPOINT_URL` does not start with `http://localhost` or
`http://127.0.0.1`, throw a clear error immediately (e.g.
`LocalOnlyViolationError: LLM_ENDPOINT_URL points to a remote host while
LLM_LOCAL_ONLY=true`) before any document fetch or LLM call happens. Add
`LLM_LOCAL_ONLY=true` to `.env.local` (via `scripts/setup-qwen.sh`, the existing
generator) so this is on by default for local dev. Document the new var in the
Environment Variables table in `CLAUDE.md`.

## 2. Per-step timing in the trace

Extend the `PipelineTrace` type in `pipeline.ts` so each step
(`scraper`, `extraction`, `classifier_filter`/`classifier_extraction` per chunk,
`relevance` per chunk) carries a `duration_ms` field. Wrap each await in
`runSandboxPipeline` with `Date.now()` before/after and attach the duration to the
corresponding trace step. For the per-chunk classify/relevance calls, attach
duration to each entry in `classifier_filter` and `relevance` individually (not just
a single aggregate), since the goal is to see latency spread across chunks, not just
total time.

Surface these in `AdminTracePage.tsx`: add a small `Xms` badge next to each existing
step badge (e.g. next to "docs discovered", next to each chunk row in the
classifier table, next to each relevance score bar). Reuse the existing
`admin-step__badge` / `admin-metric` CSS classes — don't introduce new visual
language for this.

Also extend `formatPipelineTrace.ts` (`formatPipelineTraceAsText`) to include the
duration in its text output, since that mirrors the trace shape server-side.

## 3. Local run history (lightweight, file-based — not a BigQuery mirror)

Add a new module `functions/api/src/sandbox/runLog.ts`:
- `appendRunLog(trace: PipelineTrace): void` — appends one NDJSON line per completed
  trace (job_id, status, timestamp, doc source, total duration, count of chunks
  classified as projects, top relevance score) to
  `local-run/sandbox-runs.ndjson`. Follow the exact pattern already used for
  `BEAVER_ERROR_LOG` in `packages/shared/src/observability.ts` — lazy file handle,
  gated on file path existing/writable, never throws if the write fails (logging
  must never break the pipeline it's observing).
- `listRunLog(limit = 50): SandboxRunSummary[]` — reads and parses the NDJSON file,
  most recent first.

Call `appendRunLog` at the end of `runSandboxPipeline`, after `trace.status` is set
to `'complete'` or `'error'`.

Add a new API route `GET /api/admin/sandbox/runs` in `functions/api/src/index.ts`
(or wherever sandbox routes are currently registered — check existing route
registration pattern in that file) that calls `listRunLog()` and returns the JSON
array.

Add a new frontend page `AdminRunHistoryPage.tsx` alongside the existing
`AdminInputPage.tsx`/`AdminTracePage.tsx`, reusing `AdminPage.css` classes. Show a
table: timestamp, doc source (URL or filename), status, total duration, chunks
classified as projects, top relevance score, with each row linking to
`/admin/trace/:jobId` if that trace is still in the in-memory `traceCache` (it won't
survive a server restart — that's fine, just show "trace expired" if
`getTrace(jobId)` returns undefined). Add a nav link to this page from
`AdminInputPage.tsx`'s existing banner area.

`local-run/sandbox-runs.ndjson` should be gitignored the same way
`local-run/errors.ndjson` already is — check `.gitignore` and mirror that exact
entry.

## Verification

After implementing:
1. `pnpm build` must pass with zero errors across all workspaces.
2. Run `pnpm dev:api` + the frontend dev server, submit one of the existing
   `EXAMPLE_URLS` in `AdminInputPage.tsx` through the sandbox, and confirm:
   - The trace view shows per-step millisecond timings.
   - `local-run/sandbox-runs.ndjson` gets a new line.
   - The new run history page lists that run and links back to its trace.
3. Temporarily set `LLM_ENDPOINT_URL` in `.env.local` to some non-localhost URL with
   `LLM_LOCAL_ONLY=true` still set, re-run a sandbox test, and confirm it fails
   immediately with `LocalOnlyViolationError` before any network call — not a
   timeout, an instant rejection.
