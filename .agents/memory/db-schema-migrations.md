---
name: DB schema migrations
description: Where to put SQL schema changes and how they reach the live Supabase DB
---
The app's real database is **Supabase** (accessed via `lib/supabase/admin.ts` service-role client). Any schema change (new table, column, seed) must be saved as a numbered SQL file in `app/migrations/` (e.g. `003_authorisation_connections_table.sql`), following `app/migrations/001_sites_table.sql` (CREATE TABLE IF NOT EXISTS, seed with ON CONFLICT DO NOTHING). Older one-off scripts live in `supabase/sql/`.

**Critical environment quirk:** the `executeSql` code-execution callback and the `PG*`/`DATABASE_URL` env vars point at a Replit-managed **Neon** DB (`neondb`), which the app does **not** use (it has ~1 authorisation vs Supabase's ~58). Running DDL via `executeSql` creates the table in the wrong database. There is **no automated path** from this environment to run DDL on Supabase: no Supabase connector (listConnections → 401), no `exec_sql`/`execute_sql` RPC, and no Supabase Postgres connection string in env. The Supabase service-role key only grants PostgREST (data API) access, which cannot run DDL.

**How to apply to Supabase:** the user runs the committed migration SQL in their Supabase SQL editor (this is how 001/002 reached Supabase). After they apply it, PostgREST needs its schema cache reloaded (`NOTIFY pgrst, 'reload schema';`) — the Supabase dashboard does this automatically when you run SQL there. Until applied, queries fail with `PGRST205 Could not find the table ... in the schema cache`, so write feature code to **degrade gracefully** (don't throw) when the new table is missing.

**Why:** Applying SQL only to Neon (or only locally) makes the feature non-reproducible and silently broken in the live app. Admin-managed/lookup tables are accessed only via the service-role client, so enable RLS with no policies to deny direct client access.
