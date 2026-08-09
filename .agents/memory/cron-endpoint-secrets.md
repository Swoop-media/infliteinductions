---
name: Cron endpoint secrets
description: How scheduled/cron API endpoints are secured and the CRON_SECRET env quirk
---

Scheduled jobs in this app are plain API endpoints hit by an external cron (see `/api/notifications/run-all`), secured with `Authorization: Bearer <CRON_SECRET>`.

**Why:** There is no in-app scheduler; new scheduled work should follow the same pattern (new endpoint under `/api/cron/` or `/api/notifications/`, Bearer secret check).

**How to apply:**
- `CRON_SECRET` IS set in the environment even though it does not appear in the workspace "available secrets" list — don't assume it's missing; test with `[ -n "$CRON_SECRET" ]`.
- Older notification endpoints use a lax check (`if (cronSecret && ...)` — open when unset). Newer endpoints should fail closed (refuse to run when no secret configured), like `/api/cron/document-sweep`.
