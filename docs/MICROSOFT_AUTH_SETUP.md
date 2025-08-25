
# Microsoft Authentication Setup Guide

This guide covers setting up Microsoft Single Sign-On (SSO) authentication for the INFLITE LMS.

## Prerequisites

- Microsoft 365 tenant (corporate/organization account)
- Admin access to Azure portal for App Registration
- Supabase project configured

## Azure App Registration

### 1. Create App Registration

1. Go to [Azure Portal](https://portal.azure.com) → **Azure Active Directory** → **App registrations**
2. Click **New registration**
3. Configure:
   - **Name**: `INFLITE LMS`
   - **Supported account types**: `Accounts in this organizational directory only (Single tenant)`
   - **Redirect URI**: `Web` → `https://your-replit-url.replit.dev/auth/callback`

### 2. Configure Authentication

1. Go to **Authentication** in your app registration
2. Add redirect URI: `https://your-replit-url.replit.dev/auth/callback`
3. Under **Implicit grant and hybrid flows**, enable:
   - ✅ **Access tokens**
   - ✅ **ID tokens**

### 3. API Permissions

1. Go to **API permissions**
2. Ensure these Microsoft Graph permissions:
   - `openid` (Sign users in)
   - `profile` (View users' basic profile)
   - `email` (View users' email address)
   - `User.Read` (Sign in and read user profile)

### 4. Get Credentials

1. Go to **Overview** tab
2. Copy **Application (client) ID** → use as `MICROSOFT_APP_ID`
3. Copy **Directory (tenant) ID** → use as `MICROSOFT_APP_TENANT_ID`

### 5. Create Client Secret

1. Go to **Certificates & secrets** → **Client secrets**
2. Click **New client secret**
3. Copy the **Value** → use as `MICROSOFT_APP_PASSWORD`
   - ⚠️ **Important**: Copy immediately, it won't be shown again

## Environment Configuration

Add to your `.env.local`:

```env
# Microsoft Authentication
MICROSOFT_APP_ID=your-application-client-id
MICROSOFT_APP_PASSWORD=your-client-secret-value
MICROSOFT_APP_TYPE=SingleTenant
MICROSOFT_APP_TENANT_ID=your-tenant-id
```

## Database Setup

The authentication system requires these profile enhancements:

```sql
-- Add Microsoft-specific fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS microsoft_id TEXT;
```

## User Flow

1. **Login Page** (`/auth/signin`) - Shows "Login with Microsoft" button
2. **Microsoft OAuth** - User authenticates with corporate credentials
3. **Callback Handler** (`/auth/callback`) - Processes OAuth response:
   - Creates Supabase auth user (if new)
   - Creates/updates profile with Microsoft metadata
   - Generates temporary password for session
4. **Session Establishment** (`/auth/confirm`) - Signs user in and redirects to app

## Security Features

- **Tenant Restriction**: Only users from your Microsoft tenant can login
- **No Email Confirmation**: Suitable for corporate environments where users don't have external email
- **Automatic Profile Creation**: Streamlines onboarding for new users
- **Secure Session Management**: Uses temporary passwords for reliable authentication

## Testing

1. Navigate to `/auth/signin`
2. Click "Login with Microsoft"
3. Authenticate with corporate credentials
4. Should redirect to `/app/home` when successful

## Troubleshooting

### Common Issues

**"Invalid redirect URI"**
- Ensure redirect URI in Azure matches exactly: `https://your-replit-url.replit.dev/auth/callback`
- Check that your Replit URL is correct in `NEXT_PUBLIC_SITE_URL`

**"User cannot access application"**
- Verify app registration is configured for "Single tenant"
- Check that user is part of your Microsoft tenant

**"Session not establishing"**
- Check Supabase service role key is correct
- Verify all environment variables are set properly

**"Profile creation failed"**
- Ensure Supabase RLS policies allow profile creation
- Check that `profiles` table has `microsoft_id` column

### Debug Information

Enable debug logging by checking browser console and server logs for:
- OAuth callback errors
- Supabase authentication errors
- Session establishment issues

## Advanced Configuration

### Custom User Metadata

The system automatically captures:
- `name` - Display name from Microsoft
- `microsoft_id` - Microsoft account identifier
- `email` - Primary email from Microsoft

### Role Assignment

After authentication, users start with no roles. Admins can assign roles via:
- Admin panel (`/app/admin`) 
- Direct database updates to `user_roles` table

### Teams Integration

If Microsoft Teams bot is configured, users can link their Teams account:
1. Message the bot in Teams
2. Use `/link` command
3. Enter 6-digit code from app profile page
4. Receive notifications in Teams
