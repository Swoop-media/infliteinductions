---
name: Creator-area role gating
description: How to authorize creator/admin-only API routes in this app
---

Any API route that writes creator-visible data must check roles server-side; a logged-in check alone is not enough because inserts go through the service-role client and bypass RLS.

**Why:** Peer-review endpoint initially only checked auth; code review flagged that any learner could inject records into creator-visible history (IDOR via service-role insert).

**How to apply:** Mirror the creator-area gate: `hasRole("Course Creators") || hasRole("Senior management") || hasRole("Admin")` from `lib/roles.ts` (wraps the `has_role(uid, role_name)` DB RPC). Return 403 otherwise. Learner-page preview/review query params are not role-gated, so the API must be the enforcement point.
