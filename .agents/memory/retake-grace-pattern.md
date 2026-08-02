---
name: Retake grace pattern
description: Prior authorisation stays current during a retake — pattern duplicated across several pages
---

Rule: when a completed authorisation is retaken, the live row is reset in-place and the prior state lives only in `authorisation_assignment_history` (reason='retake', with computed `expires_at`). The prior authorisation must be treated as CURRENT until the retake is approved OR the snapshot's `expires_at` passes.

**Why:** users/admins complained that in-date authorisations "disappeared" (shown as superseded/expired) the moment a retake was assigned.

**How to apply:** any surface listing a user's current authorisations must synthesize entries from the latest retake snapshot per assignment: skip if live `approved_at > snap.superseded_at` (stale) or `expires_at < now`. Implemented on myprofile, admin dashboard, admin user detail, authorisations report, and PDF export — a new surface must repeat it. Drive cross-user lookups from the history table (small) not the in-progress assignment list; index added in migration 015.
