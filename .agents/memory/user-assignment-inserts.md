---
name: User assignment insert schema
description: Correct column shapes for granting roles and assigning courses/authorisations when creating users
---

# Assigning roles/courses/auths when creating users

The admin "create user" API routes (internal + external) historically used the
WRONG insert shapes and silently failed (errors were only `console.error`'d, so
the user saw an empty user). The canonical, working shapes live in the
`assign-course` and `assign-authorization` route handlers — mirror those.

**Rule:** when writing role/course/auth assignments, copy the shape from the
existing `assign-*` routes rather than inventing fields.

Correct shapes:
- `user_roles`: keys on `role_id` (FK to `roles.name`), NOT `role_name`. Columns are
  `user_id, role_id, granted_by (uuid), granted_at`. There is NO `created_at`/`id`.
  The default signup role is **"General"** — there is no "User" role.
- `course_assignments`: `{ user_id, course_id, created_by (uuid), role: 'trainee',
  assignment_status: 'assigned', assigned_at }`. `assigned_by` exists but is a UUID —
  never pass the literal string `'Admin'`. Also upsert a `course_enrolments` row
  (`status: 'enrolled'`) so the course shows for the learner.
- `authorisation_assignments`: `{ user_id, authorisation_id, created_by (uuid),
  role: 'trainee', assignment_status: 'assigned' }`. There is NO `assigned_at` or
  `updated_at` column on this table — use `created_at` (DB default) only.

**Why:** these are real production schemas verified against live rows; the broken
routes failed with PGRST204 (missing column) and 22P02 (uuid syntax for 'Admin').

**How to apply:** the acting admin's id comes from a cookie-bound client
(`createSupabaseRoute(false).auth.getUser()`); the create routes otherwise use the
service-role admin client. Fall back to the new user's own id if no acting user.
