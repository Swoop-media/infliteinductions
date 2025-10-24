# Teams Bot Re-connection Guide

## Background
The `teams_links` database table was missing, preventing the Teams bot from saving user connections. Now that the table exists, users who were previously connected need to re-establish their connection.

## How to Re-connect

### Quick Method (Recommended)
1. Open Microsoft Teams
2. Find the **INFLITE Training** bot in your chat list
3. Send any message to the bot (e.g., "hi", "test", or any text)
4. The bot will automatically save your connection
5. Your green tick ✓ will appear in the admin panel

### Alternative: Formal Link Process
1. Message `/link` to the INFLITE Training bot
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