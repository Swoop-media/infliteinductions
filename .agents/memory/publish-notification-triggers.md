---
name: Publish notification DB triggers
description: course_published/authorisation_published notifications originate from live-DB triggers, not app code
---
The "Course published" / "Authorisation published" fan-out notifications are inserted by **triggers that exist only in the live Supabase DB** (not in repo SQL). Flipping a course/authorisation status via the service-role client (bypassing all app code) still produced notification rows — that's the proof test to use.

**Why:** grepping app code for a dispatch site finds nothing; the Supabase DB webhook then relays those trigger-inserted rows to Teams via `pages/api/notify/teams.ts`.

**How to apply:** to disable such notifications you need both (a) a migration the user runs in the Supabase SQL editor to drop the trigger (discover it via pg_trigger/pg_get_functiondef body matching — trigger names aren't in the repo), and (b) app-layer suppression (Teams route, dispatcher, bell list filter) as a stopgap until the migration is applied. Migration 012 does this; publish types are now hard-blocked in code and tracked in the admin content_audit_log / Audit Trail tab instead.
