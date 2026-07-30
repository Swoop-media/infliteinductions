---
name: Entitlement query pitfalls
description: DB query patterns that silently turn into false 403s in auth/entitlement checks
---
Rules for any server-side entitlement/access-control query against Supabase:

1. **Never run an unfiltered JSON expression filter** (e.g. `.filter("data->>storage_path","eq",x)`) on `module_content_blocks` or other large tables — it hits the Postgres statement timeout, returns null data, and a null lookup gets misread as "not entitled" → false 403 for every non-privileged user. Always add an indexed column filter first (e.g. `.eq('kind','file')`).
2. **Never use `.maybeSingle()` where duplicates can exist.** `course_assignments` has duplicate (user_id, course_id) rows for ~90+ users; `maybeSingle()` errors on >1 row and the error path denies access. Use `.limit(1)` and check array length.
3. **Distinguish lookup errors from denial**: check `error` on every entitlement query and return 500, reserving 403 for a genuine "no entitlement" result.

**Why:** After the IDOR fix to the /app/files proxy, all PDFs returned 403 for non-admin users in production due to exactly these two patterns (July 2026).

**How to apply:** Any time an access check queries content blocks or assignments before serving a file or resource.
