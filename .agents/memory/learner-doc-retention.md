---
name: Learner document retention
description: Learner documents are never deleted; replace marks old row status='replaced'
---
Learner documents must be retained for compliance. The replace pattern: mark existing active row(s) for the same user/module/block with `status='replaced'`, then insert a new row with `status='active'`. Never update-in-place, never delete rows or storage files in learner-facing flows.

**Why:** compliance requires old uploads to remain viewable under "Old documents" (myprofile + admin user page split on `status === 'replaced'` / expiry).

**How to apply:** every query that wants the *active* document must filter `.or("status.is.null,status.neq.replaced")` (status is nullable on legacy rows). The live Supabase DB has had several conflicting versions of the `upsert_learner_document` RPC (some update-in-place) — app code now does the retention logic directly instead of trusting the RPC. RLS owner policy grants no DELETE (migration 018).
