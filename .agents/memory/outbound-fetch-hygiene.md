---
name: Outbound fetch hygiene (VM wedge prevention)
description: Rules every outbound HTTP call must follow so the 1 vCPU Reserved VM can't wedge again
---
# Outbound fetch hygiene

Rules (enforced Aug 2026 after repeated VM wedges; helpers in lib/http/bounded-fetch.ts):
- Every outbound fetch must set a hard timeout (AbortSignal.timeout, 15s default).
- Every response body must be consumed (arrayBuffer/text) or cancelled — undici holds the socket open until the body is drained, including on success paths and manual-redirect hops.
- Proxied media streams (video proxies in app/app/files/[...path] and /api/sharepoint-video) go through a process-wide semaphore (max 24, 503 when full), propagate client disconnect upstream via AbortSignal.any(request.signal, lifetime cap 10min), and use guardedStream() to guarantee slot release.
- Never fall back from a failed video stream to supabase .download() — it buffers the whole file in memory.
- Multipart upload routes must reject on Content-Length BEFORE request.formData() (formData buffers the whole body).
- Cron fan-out (run-all) is single-flight (in-memory lock, valid because Reserved VM = one process) and sequential with per-job 120s timeouts; bulk Teams DM sends are batched 5 at a time.

**Why:** hung outbound fetches + unconsumed bodies pile up during upstream blips until sockets/event loop saturate and even the DB-free '/' healthcheck stalls; Reserved VMs don't auto-restart, so a wedge = outage until republish.

**How to apply:** any new route or lib that calls fetch/external APIs must follow all of the above; prefer boundedFetch/drainBody from lib/http/bounded-fetch.ts.
