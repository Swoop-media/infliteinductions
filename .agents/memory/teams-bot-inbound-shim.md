---
name: Teams bot inbound endpoint shim
description: Why the botbuilder inbound message route needs bodyParser on and a res.header shim in Next.js
---
The Teams bot inbound route (botbuilder CloudAdapter in a Next.js Pages API route) has two hard requirements:

**The rule:** keep `bodyParser: true` and keep the `res.header` shim that delegates to `res.setHeader` before calling `adapter.process()`.

**Why:** CloudAdapter zod-validates the response object and requires an Express-style `header()` function (Next.js responses don't have one) and requires a *parsed* `req.body` (rejects raw streams with 400). Without the shim every inbound Teams message 500s with `ZodError("Response")` before the bot logic runs — outbound proactive messages still work, so the breakage is silent except that "link <code>" and all inbound commands go dead. This silently broke all account linking for weeks in July 2026.

**How to apply:** any refactor of the bot messages route, botbuilder upgrade, or "security hardening" that flips bodyParser off must re-verify: a bogus-auth POST to the endpoint should return 401 (not 500), and a real inbound message should upsert a `teams_links` row.
