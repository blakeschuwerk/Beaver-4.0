# Beaver 4.0 Document Hierarchy

This file is the source of truth for which documents Claude reads and when. It evolves as the project grows. The skill file never changes—only this file does.

---

## TIER 1 — Always. Every time. No exceptions.

Read these three documents in sequence *before touching any code*:

| Document | Why This Tier | What to Read |
|----------|---------------|-------------|
| **CLAUDE.md** | Architecture source of truth. If this conflicts with ROADMAP.md, CLAUDE.md wins. | Read in full before proposing architecture changes or writing new modules. |
| **ROADMAP.md** | Sequencing authority. Tells you what phase the project is in and what work is blocked/ready/in-progress. | Read section "Where we are right now" to understand current phase status before proposing any new work. |
| **TIMELINE.md** | Append-only execution log of bugs, decisions, and fixes. Contains exact bugs already hit and fixed (BQ MERGE correlated subquery failures, streaming-buffer UPDATE restrictions, Firestore database-name mismatches, pnpm Docker symlink breakage, etc.). | Scan the most recent 10 dated entries. If your files appear in those entries, read that section in full. Never re-discover bugs we've already fixed. |

---

## TIER 2 — Read conditionally based on what your task touches

| Document | Triggers | Why This Tier |
|----------|----------|---------------|
| **OUTLETS.md** | Task involves: feature flags (SCRAPER_REAL, USE_DOCLING, LLM_MOCK_MODE), secrets, or moving fallback/mock behavior to production. | Critical for feature flag state and production toggles. Conditional because most tasks don't touch feature flags. |
| **architecture-notes.md** | Task touches: scraper county configs, platform-specific scraping quirks (Legistar, CivicPlus, custom sites), or outlet-specific parsing logic. | Prevents re-discovery of outlet-specific bugs. Only read if your files are in that category. |
| **LOCAL-TESTING.md** | Task involves: running the pipeline locally (pnpm local:run), testing with Ollama or local LLM, or debug workflows for classifier/personalization. | Documents local environment setup and common gotchas. Skip if you're only writing code; read if you're running it. |
| **.cursor/rules/beaver-architecture.mdc** | Task involves: writing any new module or significantly restructuring existing code. | Contains naming conventions, structure patterns, and module boundaries. Always read if you write a new module. |
| **.cursor/rules/node-functions.mdc** | Task involves: editing functions/dispatcher, functions/classifier, functions/personalization (Node.js code). | Naming and structure conventions specific to Node functions. |
| **.cursor/rules/python-functions.mdc** | Task involves: editing functions/scraper, functions/analyzer (Python code). | Naming and structure conventions specific to Python functions. |
| **stubs/frontend/README.md** | Task explicitly touches the frontend stub (functions/frontend). | Frontend is intentionally unbuilt. Do not start building without understanding why. |
| **stubs/notifier/README.md** | Task explicitly touches the notifier stub (functions/notifier). | Notifier is intentionally unbuilt. Do not start building without understanding why. |
| **FRONTEND-SPEC.md** | Task involves: Phase 7 frontend/testing-console design, screens, data-per-screen, or handoff to Claude Design/Cursor. | Canonical content spec for both the production app and admin testing console. Read before generating any frontend mockups or wiring code. |

---

## Decision Tree: Adding New Documents

When a new markdown or text document is created in Beaver 4.0:

```
1. Does this replace or update an existing Tier 1 document?
   ├─ YES → Replace the old document in HIERARCHY.md. Notify humans.
   └─ NO → Go to step 2.

2. Is this a bug report, fix log, or execution record?
   ├─ YES → Append to TIMELINE.md as a dated entry. Do not create a new file.
   └─ NO → Go to step 3.

3. Does this describe a decision that could conflict with CLAUDE.md or ROADMAP.md?
   ├─ YES → Merge it into CLAUDE.md or ROADMAP.md instead. Beaver 4.0 has one source of truth per category.
   └─ NO → Go to step 4.

4. Does this describe how to do something affecting multiple systems?
   (e.g., "How to set up local testing," "Debug scraper issues," "Deploy to production")
   ├─ YES → This is a Tier 2 conditional document. Determine which system(s) it supports.
           Add it to HIERARCHY.md Tier 2 with a clear trigger condition.
           Example: FIRESTORE-DEBUGGING.md → Tier 2, triggered when "task touches Firestore code."
   └─ NO → Go to step 5.

5. Is this a reference guide for a specific tool, service, or third-party integration?
   (e.g., "Legistar API reference," "BigQuery cost optimization tips")
   ├─ YES → Add it to architecture-notes.md or create a new Tier 2 entry if it covers a new system.
   └─ NO → Go to step 6.

6. Is this a stub, template, or example for future work?
   ├─ YES → Place it in stubs/ or examples/ directory. Only add to HIERARCHY.md if future-Claude needs to know about it.
   └─ NO → Reject this document. It doesn't fit Beaver 4.0's information structure.
```

---

## How to Update HIERARCHY.md

When you add a new document to Beaver 4.0:

1. **Run it through the decision tree above.** Determine its category.
2. **Add a row to the appropriate tier table** with: document name, triggers, and rationale.
3. **If creating a new Tier 2 category:** Explain what systems it supports and when to read it. Be specific—not "read when working on scraper," but "read when editing functions/scraper/county_configs.py or adding a new Legistar outlet."
4. **No human review needed.** The decision tree is the governance. If it fits a tier, it goes in HIERARCHY.md.

---

## What NOT to Do

- **Do not create new Tier 1 documents lightly.** Tier 1 is already three documents. Adding more dilutes its power. If you think something should be Tier 1, it probably belongs in CLAUDE.md or ROADMAP.md instead.
- **Do not duplicate content across HIERARCHY.md and actual docs.** HIERARCHY.md is a pointer and reading order. The real content stays in the actual docs, which are the single source of truth per category.
- **Do not add vague trigger conditions.** "Read when working on scraper" is not actionable. "Read when editing functions/scraper/county_configs.py or adding a new Legistar outlet" is.
- **Do not add a Tier 2 document without explaining why it's not Tier 1.** If it's important enough to read, be explicit about why it's conditional.

---

## Audit Schedule

**Every quarter (or after 5+ new documents are added):**

1. Are there documents referenced in HIERARCHY.md that no longer exist in the repo? Remove them.
2. Are there new documents in the repo that aren't referenced in HIERARCHY.md? Classify and add them.
3. Is any Tier 2 section now reading like "always read this"? Promote it to Tier 1 and explain why.
4. If CLAUDE.md or ROADMAP.md are substantially updated, re-evaluate Tier 2 trigger conditions. They may have become invalid.

---

## Last Audit

- **Date:** 2026-06-23
- **Added/Removed:** Added FRONTEND-SPEC.md (Tier 2); updated LOCAL-TESTING triggers for Qwen
- **Status:** Active
