---
name: Supabase .in() URL length limits
description: Large ID lists in .in() filters break the request entirely — chunk them.
---

Supabase (PostgREST) queries send `.in()` filters in the request URL. With unbounded ID lists (hundreds+ of UUIDs) the URL exceeds limits and the request fails at the network layer as `TypeError: fetch failed` — no Supabase error object, just an unhandled server exception (digest error in production).

**Why:** The admin Course Progress tab crashed in production once in-progress assignments grew large enough; dev worked fine with less data.

**How to apply:** Any query using `.in(column, ids)` on an unbounded list must chunk the IDs (~150 per request) and merge results — see `fetchInChunks` in `app/app/admin/page.tsx`. Watch for other unbounded `.in()` usages when data volumes grow.
