---
name: Parallel loaders must stay auth-gated
description: When parallelizing server-component data loading, the auth check must complete before any privileged/expensive loaders run.
---

**Rule:** When flattening sequential awaits into `Promise.all` in a server component/page, keep it two-phase: phase 1 = auth + existence check (the loader that redirects signed-out users), phase 2 = parallel tab-conditional data loads.

**Why:** A performance refactor once put `supabaseAdmin()` (service-role, RLS-bypassing) queries in the same `Promise.all` as the auth check, so privileged queries executed before unauthenticated users were redirected. Architect review flagged it as a critical auth-order regression.

**How to apply:** Any time you parallelize page loaders, check whether any of them use the admin/service-role client or do heavy work; those must only start after the auth-checking loader resolves successfully.

Related perf patterns that worked well on creator pages: load only the active tab's data (tab-conditional loaders), batch N+1 renumbering updates with `Promise.all`, cache + timeout external API calls (SafeFLITE risks: 60s in-memory cache, 5s timeout, stale-on-failure).
