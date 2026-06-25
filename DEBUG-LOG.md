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
