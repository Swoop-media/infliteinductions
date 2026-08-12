---
name: Middleware auth calls vs VM health check
description: Why the prod VM went down during Supabase blips and the rules that prevent it
---
Replit's VM deployment health check probes `/` with a short deadline. Any per-request awaited network call in Next.js middleware (e.g. `supabase.auth.getSession()`) becomes a single point of failure: if the upstream hangs, every page request AND the health probe hang, the platform marks the app down and eventually restarts the VM.

**Why:** Caused real outages (Jul 30 2026, 5 outage windows). Logs showed `healthcheck /: context deadline exceeded` alongside Supabase TLS disconnect errors; middleware had no fetch timeout.

**How to apply:**
- Middleware must early-return for cookie-less requests (health checks send no cookies) before any network I/O.
- Any network call in middleware needs a hard timeout (`AbortSignal.timeout`); with supabase-js the timeout surfaces as `AuthRetryableFetchError` / `__isAuthError && status === 0`, not `TimeoutError`.
- Health probe failures in deployment logs with app logs still flowing = event loop alive but requests stalled on upstream I/O, not a crash.
- The middleware fix alone is NOT enough (Aug 7 2026 outages recurred with it deployed): the data clients also need caps. Every server-side Supabase client must set `global.fetch` with `AbortSignal.timeout(15000)` (done in lib/supabase/server.ts + admin.ts); otherwise hung fetches pile up during a Supabase blip and saturate the VM until even static routes miss the health deadline. ~20 API routes still create their own uncapped clients (open follow-up task).

**Update (12 Aug 2026):** the "~20 API routes with uncapped clients" follow-up is DONE — merged tasks capped every remaining createClient call (verified by grep: all now set global.fetch with AbortSignal.timeout(15000)). If wedges still recur with all caps deployed, next suspects are undici keep-alive socket leaks under repeated aborts, or VM resource exhaustion (check memory on the 1 vCPU/4 GiB reserved VM).
