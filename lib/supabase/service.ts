// @ts-nocheck
// lib/supabase/service.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

export function createSupabaseService(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE || // fallback if named differently
    "";

  if (!url || !serviceKey) {
    throw new Error(
      "Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  // Admin client — bypasses RLS. Do NOT use in client/browser code.
  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
