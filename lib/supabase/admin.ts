// @ts-nocheck
// lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service-role client for secure server-side operations (bypasses RLS)
export function supabaseAdmin() {
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env vars for admin client.");
  }
  return createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // Hard cap on Supabase HTTP round-trips: during Supabase connectivity
    // blips, requests without a timeout hang, pile up, and saturate the VM
    // until the health check stalls (root cause of the Aug 2026 outages).
    // Explicit caller-provided AbortSignals take precedence.
    global: {
      fetch: (input: any, init?: any) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }),
    },
  });
}
