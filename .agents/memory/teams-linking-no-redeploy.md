---
name: Teams linking without redeploy
description: How to link Teams users when the published build's inbound bot endpoint is broken and republishing is unavailable
---
**The rule:** Teams user linking is fully runtime/DB-driven (`teams_links` in the shared Supabase DB) — nothing is baked into the deployed build. If prod's inbound bot endpoint is broken (bogus-auth POST returns 500 instead of 401), temporarily point the Azure Bot's messaging endpoint (Azure portal → Bot → Configuration) at the dev domain's `/api/teams/bot/messages`, let users run the normal `link <code>` flow against dev, then switch it back. Prod outbound (proactive DMs) keeps working because it only reads `teams_links`.

**Why:** July 2026 — publishing was unavailable while prod's build predated the inbound shim fix; this workaround linked users with zero code changes. Dev shares the same Supabase DB and full bot credentials (MICROSOFT_APP_PASSWORD comes from env, MICROSOFT_APP_TYPE/SUPABASE_URL from `.env.local`), so dev-side link writes are immediately visible to prod.

**How to apply:** Probe with `curl -X POST <base>/api/teams/bot/messages -H "Authorization: Bearer bogus" ...` — 401 = healthy, 500 = broken shim. Keep the dev workflow running the whole time the endpoint points at dev; the `.replit.dev` domain is temporary, so switch back promptly. Verify links afterward via the admin Teams link-test page (sends real proactive DMs through prod's outbound path).
