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
