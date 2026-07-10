---
name: Creator-area role gating
description: How to authorize creator/admin-only API routes in this app
---

Any API route that writes creator-visible data must check roles server-side; a logged-in check alone is not enough because inserts go through the service-role client and bypass RLS.

**Why:** An auth-only check on a service-role write lets any learner inject records into creator-visible data (IDOR), since RLS is bypassed.

**How to apply:** Mirror the creator-area gate: `hasRole("Course Creators") || hasRole("Senior management") || hasRole("Admin")` from `lib/roles.ts` (wraps the `has_role(uid, role_name)` DB RPC). Return 403 otherwise. Learner-page preview/review query params are not role-gated, so the API must be the enforcement point.

**RLS-scoped writes silently no-op:** A `.update()`/`.delete()` run through the RLS-scoped cookie client (`createSupabaseServer()`) against a table whose policy doesn't grant the user that op returns success with 0 rows and `error === null` — no exception, so a redirect with `?notice=saved` fires but nothing persists (symptom: edit "reverts" after save). Confirmed on `module_content_blocks`: anon/user PATCH → 200 `[]`; service-role PATCH → 1 row. Fix: creator block writes use `supabaseAdmin()` from `lib/supabase/admin.ts` (dedicated non-cookie service-role client) plus a server-side role guard. Do NOT rely on `createSupabaseServer(true)` for this — it's still cookie-aware and can execute as the signed-in user's JWT, so RLS may still apply.
