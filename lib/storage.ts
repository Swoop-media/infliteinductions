// @ts-nocheck
// lib/storage.ts
import { createSupabaseService } from "@/lib/supabase/service";

/**
 * Ensure a storage bucket exists (idempotent).
 * Uses the service client, so it works whether the bucket is public or private.
 */
export async function ensureBucket(name: string, opts?: { public?: boolean }) {
  const admin = createSupabaseService();

  // If it already exists, we're done.
  const { data: got } = await admin.storage.getBucket(name);
  if (got) return;

  // Create it (private by default)
  await admin.storage.createBucket(name, { public: !!opts?.public });
}
