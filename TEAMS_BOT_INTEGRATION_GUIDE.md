# Teams Bot Notification Integration Guide

This document explains how to integrate with the existing INFLITE Teams Bot to send notifications from another application.

---

## Overview

The INFLITE LMS uses a Microsoft Teams bot to send proactive notifications to users. The bot uses **conversation references** stored in a Supabase database (`teams_links` table) to send direct messages to users who have linked their Teams accounts.

This guide will help you integrate your app to use the **same bot** for sending notifications.

---

## Prerequisites

Before integrating, you need:

1. **Access to the same Supabase database** (or a shared `teams_links` table)
2. **Microsoft Bot credentials** (shared across apps):
   - `MICROSOFT_APP_ID`
   - `MICROSOFT_APP_PASSWORD`
   - `MICROSOFT_APP_TENANT_ID`
   - `MICROSOFT_APP_TYPE` (typically `SingleTenant` or `MultiTenant`)
3. **Supabase credentials**:
   - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY`

---

## Database Schema

The bot relies on a `teams_links` table in Supabase:

```sql
CREATE TABLE teams_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                    -- Your app's user ID
  teams_user_id TEXT,                        -- Microsoft Teams user ID
  aad_object_id TEXT,                        -- Azure AD object ID
  conversation_ref JSONB NOT NULL,           -- Stored conversation reference for proactive messaging
  last_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Key field**: `conversation_ref` - This JSON object contains all the information needed to send proactive messages to the user via Teams.

---

## Integration Code

### Required Dependency

Install the `botbuilder` package (only needed if you use the adapter approach):

```bash
npm install botbuilder
```

However, the **recommended approach** is to use direct HTTP calls (no additional dependencies needed).

---

### Core Function: Send Proactive Message

Copy this function to send Teams notifications:

```typescript
// lib/teams/proactive.ts

export async function sendProactive(conversationRef: any, text: string) {
  // Get access token
  const appType = process.env.MICROSOFT_APP_TYPE || "MultiTenant";
  const tenantId = process.env.MICROSOFT_APP_TENANT_ID || "";
  const tenant = appType === "SingleTenant" ? tenantId : "botframework.com";
  
  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const tokenParams = new URLSearchParams();
  tokenParams.set("client_id", process.env.MICROSOFT_APP_ID || "");
  tokenParams.set("client_secret", process.env.MICROSOFT_APP_PASSWORD || "");
  tokenParams.set("grant_type", "client_credentials");
  tokenParams.set("scope", "https://api.botframework.com/.default");

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Token request failed: ${tokenResponse.status} - ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  // Send the message
  const replyUrl = `${conversationRef.serviceUrl}/v3/conversations/${conversationRef.conversation.id}/activities`;
  const botAppId = process.env.MICROSOFT_APP_ID || "";

  const messageActivity = {
    type: "message",
    from: { id: botAppId },
    recipient: { id: conversationRef.user.id },
    conversation: { id: conversationRef.conversation.id },
    serviceUrl: conversationRef.serviceUrl,
    text: text,
  };

  const messageResponse = await fetch(replyUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(messageActivity)
  });

  if (!messageResponse.ok) {
    const errorText = await messageResponse.text();
    throw new Error(`Message send failed: ${messageResponse.status} - ${errorText}`);
  }

  return await messageResponse.json();
}
```

---

### Send Notification to a User

Use this function to send a Teams DM to a user by their app user ID:

```typescript
// lib/teams/send.ts
import { createClient } from "@supabase/supabase-js";
import { sendProactive } from "./proactive";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase admin env not set.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function sendTeamsDMToAppUser(appUserId: string, text: string): Promise<boolean> {
  const sb = supabaseAdmin();
  
  // Get the most recent Teams link for this user
  const { data: links, error } = await sb
    .from("teams_links")
    .select("conversation_ref, teams_user_id, aad_object_id, user_id, created_at")
    .eq("user_id", appUserId)
    .order("created_at", { ascending: false })
    .limit(1);
  
  if (error) {
    console.error("Database error looking up Teams link:", error);
    throw error;
  }

  const data = links?.[0] || null;
  const ref = data?.conversation_ref;
  
  if (!ref) {
    console.log("No conversation reference found for user:", appUserId);
    console.log("User needs to link their Teams account first");
    return false;
  }

  try {
    await sendProactive(ref, text);
    console.log("Teams message sent successfully to user:", appUserId);
    return true;
  } catch (error) {
    console.error("Failed to send Teams message:", error);
    throw error;
  }
}
```

---

## Usage Examples

### Basic Notification

```typescript
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

// Send a simple notification
await sendTeamsDMToAppUser(
  "user-uuid-here",
  "Hello! This is a notification from Your App."
);
```

### Notification with Error Handling

```typescript
import { sendTeamsDMToAppUser } from "@/lib/teams/send";

async function notifyUser(userId: string, message: string) {
  try {
    const sent = await sendTeamsDMToAppUser(userId, message);
    if (!sent) {
      console.log("User hasn't linked their Teams account yet");
      // Fall back to email or in-app notification
    }
  } catch (error) {
    console.error("Failed to send Teams notification:", error);
    // Handle error - maybe queue for retry
  }
}
```

### Notification Dispatcher Pattern

```typescript
// lib/notifications/dispatcher.ts

type NotificationType = 
  | "task_assigned"
  | "deadline_reminder"
  | "status_update"
  | "approval_needed";

interface NotificationPayload {
  userId: string;
  type: NotificationType;
  data: Record<string, any>;
  sendTeams?: boolean;
  sendEmail?: boolean;
}

export async function notifyUser(payload: NotificationPayload) {
  const { userId, type, data, sendTeams = true, sendEmail = false } = payload;
  
  // Format the message based on notification type
  const message = formatNotificationMessage(type, data);
  
  // Send Teams notification
  if (sendTeams) {
    try {
      await sendTeamsDMToAppUser(userId, message);
    } catch (error) {
      console.error("Teams notification failed:", error);
    }
  }
  
  // Add email logic if needed
  if (sendEmail) {
    // ... email sending logic
  }
}

function formatNotificationMessage(type: NotificationType, data: Record<string, any>): string {
  switch (type) {
    case "task_assigned":
      return `📋 New task assigned: ${data.taskName}`;
    case "deadline_reminder":
      return `⏰ Reminder: ${data.taskName} is due on ${data.dueDate}`;
    case "status_update":
      return `🔄 Status update: ${data.itemName} is now ${data.status}`;
    case "approval_needed":
      return `✅ Action required: ${data.itemName} needs your approval`;
    default:
      return data.message || "You have a new notification";
  }
}
```

---

## Environment Variables Required

Add these to your `.env.local` or Replit Secrets:

```env
# Microsoft Bot Framework (same as main LMS app)
MICROSOFT_APP_ID=your-app-id
MICROSOFT_APP_PASSWORD=your-app-password
MICROSOFT_APP_TENANT_ID=your-tenant-id
MICROSOFT_APP_TYPE=SingleTenant

# Supabase (same database as main LMS app)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## Important Notes

1. **User must link first**: Users can only receive Teams notifications if they have already linked their Teams account in the main LMS app. The linking creates the `conversation_ref` in the `teams_links` table.

2. **Same Bot, Different App**: You're using the SAME Microsoft Bot registration. The bot credentials (`MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD`) must be identical across apps.

3. **Shared Database**: Both apps must have access to the same `teams_links` table in Supabase. The `user_id` must match across systems.

4. **No Bot Endpoint Needed**: Your app doesn't need to handle incoming bot messages - it only sends outbound notifications. The main LMS app handles the bot message endpoint (`/api/teams/bot/messages`).

5. **Rate Limits**: Microsoft imposes rate limits on bot messages. For bulk notifications, implement queuing and respect rate limits.

---

## Troubleshooting

### Common Issues

1. **"No conversation reference found"**
   - User hasn't linked their Teams account in the main app
   - Solution: User needs to message the bot or complete the linking flow

2. **"Token request failed"**
   - Check `MICROSOFT_APP_ID` and `MICROSOFT_APP_PASSWORD` are correct
   - Ensure `MICROSOFT_APP_TYPE` matches the bot registration

3. **"Message send failed: 401"**
   - Bot credentials are incorrect or expired
   - Check the bot is still registered in Azure

4. **"Message send failed: 403"**
   - Conversation reference is stale or user uninstalled the bot
   - User needs to re-link their Teams account

---

## Agent Prompt

Copy the following prompt to give to your Replit agent:

```
I need to integrate Teams notifications into my app using an existing Microsoft Teams bot.

The bot is already set up in another app. I need to:

1. Create these files:
   - lib/teams/proactive.ts - Function to send proactive messages via Bot Framework REST API
   - lib/teams/send.ts - Function to look up user's conversation reference and send a message

2. Required environment variables (I'll provide these):
   - MICROSOFT_APP_ID
   - MICROSOFT_APP_PASSWORD  
   - MICROSOFT_APP_TENANT_ID
   - MICROSOFT_APP_TYPE (SingleTenant)
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY

3. The user lookup is done via Supabase table called "teams_links" with these columns:
   - user_id (UUID) - The app user's ID
   - conversation_ref (JSONB) - The stored conversation reference for proactive messaging

4. The main function I need is: sendTeamsDMToAppUser(appUserId: string, text: string)

5. To send a message:
   - First get an OAuth token from Microsoft using client credentials
   - Then POST to the Bot Framework REST API using the stored conversation reference

Please implement this following the patterns in the integration guide.
```

---

## File Structure

```
your-app/
├── lib/
│   └── teams/
│       ├── proactive.ts    # Low-level function to send via REST API
│       └── send.ts         # High-level function to send by user ID
├── .env.local              # Environment variables
└── ...
```
