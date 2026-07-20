---
name: Teams channel webhooks
description: Gotchas for posting Adaptive Cards to Teams channels via webhooks in this project
---

- Microsoft retired the old Office 365 "Incoming Webhook" connector URLs (`*.webhook.office.com`) around end of 2025 — they return empty 403s. Replacements must be Power Automate Workflows webhooks ("Post to a channel when a webhook request is received"), which accept the same `{type:"message", attachments:[adaptive card]}` payload and return 202.
- **Why:** the channel posting silently died for months; the code caught fetch errors and only console.error'd, so nobody noticed.
- Webhook secrets have historically been pasted malformed (whole `NAME="url"` assignment or quote-wrapped as the value). The channel-webhook lib sanitizes values before use — keep that sanitizer when touching webhook code, and expect paste mistakes when users update webhook secrets.
- **How to apply:** if Teams channel posts stop working, first test-post directly with curl/node; a 403 from webhook.office.com means the URL type is retired, not an auth issue.
