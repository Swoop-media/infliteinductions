# Threat Model

## Project Overview

This project is a production Learning Management System for internal staff, contractors, trainers, course creators, and admins. It is a Next.js 15 app backed by Supabase Auth, Postgres, and Supabase Storage, with Microsoft OAuth, Teams bot/webhook integrations, SharePoint video handling, and SafeFLITE integrations. The production deployment is public on the internet, so any route without server-side access control must be treated as externally reachable.

Assumptions for this scan:
- Production uses `NODE_ENV=production`.
- TLS is handled by the platform.
- Mockup sandbox environments are out of scope unless production reachability is shown.
- This deployment is public, so private/password deployment protections do not apply.

## Assets

- **User accounts and sessions** — Supabase sessions, OAuth state, password-reset flows, and Teams link codes. Compromise allows impersonation and unauthorized access.
- **Training and authorization records** — course assignments, progress, approvals, expiry data, learner documents, and audit-relevant status changes. Unauthorized modification can falsely certify users or hide compliance gaps.
- **Personal data** — names, email addresses, uploaded documents, issue reports, Teams identifiers, and training history. Exposure affects both staff and contractors.
- **Privileged service credentials** — Supabase service-role key, Teams bot credentials, webhook secrets, SafeFLITE sync secrets, and Resend credentials. Misuse can bypass RLS, send messages as the bot, or access external systems.
- **Private stored files** — course files, videos, learner evidence, and requirement uploads in Supabase Storage. Improper access could expose sensitive business or personnel records.

## Trust Boundaries

- **Browser to Next.js routes** — all `/app/*`, `/auth/*`, `/api/*`, and legacy `pages/api/*` endpoints receive attacker-controlled input and must enforce auth and authorization server-side.
- **Next.js server to Supabase** — code using anon/session clients relies on RLS; code using service-role/admin clients bypasses RLS and must implement explicit authorization.
- **Authenticated user to admin/creator/trainer roles** — role separation is central to the product. Server-side checks must prevent learners or unauthenticated users from reaching admin, creator, trainer, or diagnostic actions.
- **Server to external services** — Teams, Microsoft identity endpoints, SharePoint, Resend, and SafeFLITE are outside the app trust boundary. Inbound webhooks must be authenticated; outbound fetches must not become SSRF sinks.
- **Public internet to debug/test utilities** — any route left in the production app is in scope even if named debug or test. Naming is not a control.

## Scan Anchors

- **Production entry points:** `app/api/**`, `app/app/**`, `app/auth/**`, `pages/api/**`, `middleware.ts`.
- **Highest-risk areas:** Teams bot and proactive messaging routes, debug/test routes under `app/api` and `pages/api`, routes using `supabaseAdmin()` / service-role clients, storage proxy and signed-URL routes, webhook/integration endpoints.
- **Surface split:** public routes include login flows and several integration/debug endpoints; most learner pages are authenticated; admin/creator/train-assess surfaces require strict role checks.
- **Dev-only caution:** mock/test assets are out of scope unless wired into production routes. However, debug/test route handlers shipped under `app/api` or `pages/api` are production-reachable and must be reviewed.

## Threat Categories

### Spoofing

This app accepts identities from Supabase Auth, Microsoft OAuth, Teams bot traffic, and webhook callers. The system must validate sessions on every protected route, verify inbound bot or webhook authenticity before trusting payloads, and bind any account-linking flow to verified identities. A header that merely looks like authentication is not sufficient.

### Tampering

The platform stores compliance-critical training progress, authorization approvals, and uploaded evidence. Any route that uses a Supabase service-role client must perform explicit server-side authorization before modifying records. Training completion, retakes, approvals, and assignment changes must never be triggerable by unauthenticated callers or lower-privileged users.

### Information Disclosure

The app handles PII, learner documents, training records, Teams metadata, and issue reports. Responses, debug endpoints, logs, and signed URL helpers must only expose data to authorized users. Storage proxies must not let any authenticated user fetch arbitrary objects without checking entitlement to the underlying file.

### Denial of Service

Public routes that trigger expensive background work, notification fan-out, large file handling, or repeated external API calls can be abused for resource exhaustion or message spam. Production-reachable job runners, debug triggers, and upload helpers must require auth or shared-secret protection and should minimize attacker-controlled amplification.

### Elevation of Privilege

The biggest project-specific risk is misuse of `supabaseAdmin()` / service-role access. Any production route that bypasses RLS without strong auth and role checks can become a full privilege-escalation path. Debug and test utilities are especially dangerous because they often mutate sensitive data while assuming a trusted caller.
