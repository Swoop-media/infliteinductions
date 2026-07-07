---
name: Notification type enum
description: notifications.type is a Postgres enum; new notification types need an enum migration or in-app inserts fail silently
---

The `notifications.type` column in Supabase is the Postgres enum `notif_type`, not text.

**Why:** Inserting a notification with a type not in the enum fails, and the dispatcher swallows insert errors (logs and continues), so in-app notifications silently never appear while Teams DMs still send — easy to miss.

**How to apply:** When introducing a new notification type, also add an idempotent `ALTER TYPE notif_type ADD VALUE ...` migration in `app/migrations/` (user applies it manually in the Supabase SQL editor). No direct SQL access exists from the workspace (no DB connection string, no exec-sql RPC); the enum's current values can be inspected via the PostgREST OpenAPI schema (`GET {SUPABASE_URL}/rest/v1/` with the service key) under `definitions.notifications.properties.type.enum`.
