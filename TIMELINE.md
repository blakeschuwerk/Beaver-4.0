# Beaver 4.0 — Implementation Timeline

> Append-only log tracking execution of [ROADMAP.md](./ROADMAP.md).
> Each entry: **Observed** (what we found), **Decided**, **Did**, **Verified**.

---

## 2026-06-21 — Phase 0/1 kickoff (planning session)

| Field | Detail |
|-------|--------|
| **Phase** | 0 (fold-in) + 1 (plumbing) |
| **Observed** | Live `beaver4`: 12 Pub/Sub topics exist; GCS OBJECT_FINALIZE notifications wired to `raw-documents` and `extracted-chunks`. **Zero Pub/Sub subscriptions** — local `terraform.tfstate` has 0 subscription resources; pipeline unwired end-to-end. Only Firestore DB is `beaver-firebase` (no `(default)`). F1/F5 had uncommitted `FIRESTORE_DATABASE` fix; F2 scraper still used default DB. All 5 Cloud Run services deployed; BQ tables exist. |
| **Decided** | Fold Phase 0 leftovers into Phase 1. Create missing subscriptions via terraform apply. Add DLQ IAM + pull subs. Seed synthetic county for plumbing tests. LLM/Docling mock paths remain (Phase 3/4); Phase 1 = real GCS/BQ/PubSub I/O with library fallbacks. |
| **Did** | Created Phase 1 execution plan; verified gcloud auth to `beaver4`. |
| **Verified** | `gcloud run services list` shows all 5 services healthy URLs. |

---

## 2026-06-21 — Phase 0 fold-in + Phase 1 implementation

| Field | Detail |
|-------|--------|
| **Phase** | 0 + 1 |
| **Observed** | (in progress) |
| **Decided** | (in progress) |
| **Did** | (in progress) |
| **Verified** | (pending) |
