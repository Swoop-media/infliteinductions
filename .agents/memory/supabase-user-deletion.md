---
name: Supabase auth user deletion blocked by user_roles
description: auth.admin.deleteUser fails silently unless dependent public rows are removed first
---

**Rule:** `supabase.auth.admin.deleteUser()` fails with "Database error deleting user" whenever a `user_roles` row exists for that user — a signup DB trigger auto-creates profile + user_roles rows, and the user_roles FK to auth.users has no ON DELETE CASCADE.

**Why:** This silently broke the cleanup path in user-creation routes: after a failed step, the auth account survived, so retries hit "A user with this email address has already been registered" and admins had to delete orphans by hand (observed July 2026).

**How to apply:** Any code that deletes an auth user must first delete dependent public-schema rows (`user_roles` by user_id AND granted_by, assignments, enrolments, `profiles`), then call `deleteUser`, and must check the returned error instead of fire-and-forget. Orphan detection: an auth user with no `profiles` row is a safe signal of a failed creation (healthy accounts always have one via the trigger).

Also: the SafeFLITE sync endpoint rejects users without a microsoft_id (400), so syncing external email/password users is pointless — skip it.
