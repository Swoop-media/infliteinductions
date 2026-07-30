---
name: NEON_DATABASE_URL is not the Supabase DB
description: The pg connection secret points to a Neon copy, not the live Supabase database
---
`NEON_DATABASE_URL` connects as `neondb_owner` to a **Neon** Postgres that mirrors the schema — it is NOT the live Supabase database the app uses. DDL applied there does not reach production, and trigger/function inspection there does not reflect the live Supabase DB.

**Why:** Migration 013 was applied via that URL and "succeeded", but PostgREST (Supabase) returned PGRST205 (table missing) — proving the two databases are different.

**How to apply:** There is still no DDL path to the live Supabase DB from this environment. Schema changes go in numbered `app/migrations/*.sql` files that the user runs in the Supabase SQL editor. To inspect live triggers/functions, give the user a read-only query to run there, or infer from behavior (service-role write test per publish-notification-triggers.md).
