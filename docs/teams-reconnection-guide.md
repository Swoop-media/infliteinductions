# Teams Bot Re-connection Guide

## Updating the Bot's Name or Logo
The bot's display name and icon in Teams are NOT stored in this codebase. The app was originally created in the **Teams Developer Portal** (dev.teams.microsoft.com → Apps → "INFLITE communication", App ID `36b1d7be-7e60-4a27-8199-af9ccaee352c`). Edit the name under Basic information and the icons under Branding there, then Publish → Publish to your org.

Note: the Teams admin center (admin.teams.microsoft.com) shows a DIFFERENT id in its URL/About tab (`7e943680-...`) — that is an internal catalog id, not the app's manifest ID. Uploading a zip with that id as the manifest `id` fails with a generic "We can't upload the app" error. Always use the Developer Portal App ID.

A ready-to-edit copy of the app package now lives in `teams-app-package/` (zip: `inflite-communications-teams-app.zip`). To change the name/logo again:
1. Edit `teams-app-package/manifest.json` (bump the `version`, e.g. 1.0.1 → 1.0.2) and/or replace the icon PNGs (color.png must be 192x192, outline.png must be 32x32 white-on-transparent).
2. Re-zip the three files (flat, no folder): `cd teams-app-package && zip -j ../inflite-communications-teams-app.zip manifest.json color.png outline.png`
3. Upload the zip as a new version in the Teams admin center. The `id` in manifest.json must stay the same (it's the Teams app ID) and `botId` must remain the bot's Microsoft App ID.

## Background
The `teams_links` database table was missing, preventing the Teams bot from saving user connections. Now that the table exists, users who were previously connected need to re-establish their connection.

## How to Re-connect

### Quick Method (Recommended)
1. Open Microsoft Teams
2. Find the **INFLITE communications** bot (previously "INFLITE Training") in your chat list
3. Send any message to the bot (e.g., "hi", "test", or any text)
4. The bot will automatically save your connection
5. Your green tick ✓ will appear in the admin panel

### Alternative: Formal Link Process
1. Message `/link` to the INFLITE communications bot
2. Bot will provide a 6-digit code
3. Go to your profile settings in the INFLITE app
4. Enter the code to link your account
5. Connection established

## For Administrators

### Checking Connection Status
- Go to Admin panel → Users tab
- Look for the "Teams" column
- ✓ Green tick = Connected
- ✗ Red cross = Not connected

### Database Check
To verify connections in the database:
```sql
SELECT 
    p.full_name,
    p.email,
    tl.teams_user_id,
    tl.created_at as connected_at
FROM profiles p
LEFT JOIN teams_links tl ON tl.user_id = p.id
WHERE tl.teams_user_id IS NOT NULL
ORDER BY tl.created_at DESC;
```

## Important Notes
- Previous connection data cannot be recovered (table didn't exist)
- Users only need to reconnect once
- Any message to the bot triggers automatic connection
- The bot must be running for connections to work