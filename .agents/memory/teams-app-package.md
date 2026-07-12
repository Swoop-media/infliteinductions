---
name: Teams app package (bot name/logo)
description: Where the Teams bot's display name and icon live and how to update them
---
The Teams bot's display name and icon are NOT in the codebase — they come from a Teams app package (manifest.json + 192x192 color.png + 32x32 white outline.png) uploaded to the Teams admin center.

**Why:** The original package was uploaded directly to Microsoft and never committed, so it was unfindable. A reconstructed copy now lives in `teams-app-package/` with upload steps documented in `docs/teams-reconnection-guide.md`.

**How to apply:** To rename/re-icon the bot, edit the package, bump manifest `version`, re-zip flat, and upload as "New version" in Teams admin center. Keep `id` (Teams app ID) and `botId` (Microsoft App ID) unchanged.
