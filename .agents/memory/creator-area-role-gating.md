---
name: Creator-area role gating
description: How to authorize creator/admin-only API routes in this app
---

Any API route that writes creator-visible data must check roles server-side; a logged-in check alone is not enough because inserts go through the service-role client and bypass RLS.

**Why:** An auth-only check on a service-role write lets any learner inject records into creator-visible data (IDOR), since RLS is bypassed.

**How to apply:** Mirror the creator-area gate: `hasRole("Course Creators") || hasRole("Senior management") || hasRole("Admin")` from `lib/roles.ts` (wraps the `has_role(uid, role_name)` DB RPC). Return 403 otherwise. Learner-page preview/review query params are not role-gated, so the API must be the enforcement point.

**RLS-scoped writes can silently no-op:** an `.update()`/`.delete()` through the RLS-scoped cookie client (`createSupabaseServer()`) on a table whose policy doesn't grant the caller that op returns success with 0 rows and `error === null` — no exception thrown, so a "saved" redirect fires but nothing persisted. For privileged creator/admin writes use the dedicated non-cookie service-role client (`supabaseAdmin()` in `lib/supabase/admin.ts`) plus a server-side role gate. Do NOT rely on `createSupabaseServer(true)` — it's still cookie-aware and can run as the user's JWT, so RLS may still apply.

**Tiptap save gotcha:** when saving a Tiptap (v3) editor's HTML via a form/server action, read it live from the editor instance (`editor.getHTML()`) at submit time, not from a React state var fed by `onChange` — the state can lag/stale and you silently persist the pre-edit value.
