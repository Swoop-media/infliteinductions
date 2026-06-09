---
name: DB schema migrations
description: Where to put SQL schema changes so all environments stay reproducible
---
Any Supabase schema change (new table, column, seed) must be saved as a numbered SQL file in `app/migrations/` (e.g. `002_job_descriptions_table.sql`), in addition to applying it to the live DB.

**Why:** Applying SQL only to the dev DB makes the feature non-reproducible — fresh/staging/prod environments won't have the table and fail at runtime. Code review will flag missing migrations as a blocking gap.

**How to apply:** Follow the existing convention in `app/migrations/001_sites_table.sql` (CREATE TABLE IF NOT EXISTS, seed with ON CONFLICT DO NOTHING). Admin-managed lookup tables (sites, job_descriptions) are accessed only via the Supabase admin/service-role client, so enable RLS with no policies to deny direct client access.
