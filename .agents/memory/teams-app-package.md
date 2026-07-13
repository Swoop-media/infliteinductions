---
name: Teams app package (bot name/logo)
description: Where the Teams bot's display name and icon live and how to update them
---
The Teams bot's display name and icon are NOT in the codebase — the app lives in the Teams Developer Portal (dev.teams.microsoft.com), where name/icons are edited and published to the org.

**Why:** The original app was created via Dev Portal and never committed. Also, the Teams admin center shows an *internal catalog id* in its URL/About tab that differs from the real manifest App ID — building a package with the catalog id makes the admin-center "new version" upload fail with a generic "We can't upload the app" error.

**How to apply:** Edit via Dev Portal (Basic information + Branding) and Publish → Publish to your org. A reconstructed package copy lives in `teams-app-package/` with the correct Dev Portal App ID; process documented in `docs/teams-reconnection-guide.md`. Icons: 192x192 color, 32x32 white-on-transparent outline.

**Two-places gotcha:** The Dev Portal/manifest name only controls the app-store listing. The name shown in the chat window and on bot messages comes from the *Azure bot registration's Display name* (Azure portal → Bot Services → bot resource → Settings/Bot profile). Both must be changed to fully rename the bot. Teams caches the chat name — restart Teams or remove/re-add the app to see the change.
