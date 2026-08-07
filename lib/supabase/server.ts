// @ts-nocheck
// lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Hard cap on Supabase HTTP round-trips (Auth/PostgREST/Storage/Functions —
// Realtime is not used server-side). During Supabase connectivity blips (TLS
// disconnects), requests without a timeout hang indefinitely, pile up, and
// saturate the VM until even the health check stalls — causing outages.
// 15s comfortably exceeds any legitimate query (server→Supabase storage
// transfers are datacenter-fast) while failing hung sockets quickly. Callers
// can pass their own AbortSignal, which takes precedence.
const timeoutFetch = (input: any, init?: any) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) });

/** For Server Components */
export async function createSupabaseServer(useAdmin: boolean = false): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  
  return createServerClient<Database>(
    supabaseUrl,
    useAdmin ? supabaseServiceRoleKey : supabaseAnonKey,
    {
      global: { fetch: timeoutFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component cannot set cookies
          }
        },
      },
    }
  );
}

/** For Server Actions */
export async function createSupabaseAction(useAdmin: boolean = false): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  
  return createServerClient<Database>(
    supabaseUrl,
    useAdmin ? supabaseServiceRoleKey : supabaseAnonKey,
    {
      global: { fetch: timeoutFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Action might not be able to set cookies in some contexts
          }
        },
      },
    }
  );
}

/** For Route Handlers (e.g., files under app route handlers) */
export async function createSupabaseRoute(useAdmin: boolean = false): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  
  return createServerClient<Database>(
    supabaseUrl,
    useAdmin ? supabaseServiceRoleKey : supabaseAnonKey,
    {
      global: { fetch: timeoutFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // Route Handler might not be able to set cookies in some contexts
          }
        },
      },
    }
  );
}
