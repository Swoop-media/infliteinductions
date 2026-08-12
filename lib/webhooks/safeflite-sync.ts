interface UserSyncPayload {
  microsoft_id: string | null;
  email: string | null;
  full_name: string | null;
  job_description: string | null;
  department: string | null;
  created_at: string | null;
  updated_at: string | null;
  archived_at: string | null;
}

export async function syncUserToSafeflite(user: UserSyncPayload): Promise<void> {
  const syncSecret = process.env.TRAINING_SYNC_SECRET;
  
  if (!syncSecret) {
    console.warn('TRAINING_SYNC_SECRET not configured, skipping SafeFLITE sync');
    return;
  }

  const webhookUrl = 'https://yakvuypqwqhdtkpgqdcf.supabase.co/functions/v1/sync-training-user';

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${syncSecret}`
      },
      // Hard timeout: hung outbound fetches pile up and wedge the VM (Aug 2026).
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        microsoft_id: user.microsoft_id,
        email: user.email,
        full_name: user.full_name,
        job_description: user.job_description,
        department: user.department,
        created_at: user.created_at,
        updated_at: user.updated_at,
        archived_at: user.archived_at
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`SafeFLITE sync failed (${response.status}):`, errorText);
    } else {
      // Consume the body so undici releases the socket.
      await response.arrayBuffer().catch(() => {});
      console.log(`SafeFLITE sync successful for user: ${user.email}`);
    }
  } catch (error) {
    console.error('SafeFLITE sync error:', error);
  }
}
