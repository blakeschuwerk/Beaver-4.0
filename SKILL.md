---
name: beaver-context
description: >
  Mandatory context loading for ANY work in Beaver 4.0. Enforces strict documentation-reading
  order before development begins. Triggers on all repository operations to prevent
  re-discovery of already-solved bugs and prevent contradicting established architectural decisions.
---

# Beaver 4.0 Context Skill

**Stop. Before you write any code in Beaver 4.0, read the document hierarchy.**

Go to `HIERARCHY.md` in the root of this repository. It contains the canonical reading order for all project documentation. Read it now, and follow the tiers and triggers it specifies.

## Why This Exists

Beaver 4.0 has hit non-obvious bugs in BigQuery, Firestore, pnpm Docker workflows, and scraper county configs. Each was solved. Each is documented. Each was re-discovered because context wasn't loaded in the right order.

**HIERARCHY.md enforces that order.** This skill just tells you to read it.

## After You Read HIERARCHY.md

Once you understand the reading order, do this before and after work:

1. **Before starting:** State which phase (per ROADMAP.md) your current task falls under.

2. **Before touching code:** Check TIMELINE.md's most recent entries for any unresolved issues relevant to the files you're about to edit.

3. **After finishing work** (real work, not minor doc edits):
   - Append a new dated entry to TIMELINE.md in its existing table format: `Observed | Decided | Did | Verified`
   - Update ROADMAP.md's status fields if you crossed a phase boundary

That's it. The rest lives in HIERARCHY.md.
