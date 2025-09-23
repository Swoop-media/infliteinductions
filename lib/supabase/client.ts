// @ts-nocheck
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Client-side Supabase client using the new SSR package.
 * This keeps the session in cookies so server components/middleware see it.
 */
export const supabaseBrowser = createBrowserClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);

// Add the missing export for backward compatibility
export const createSupabaseClient = () => supabaseBrowser;

// Export for auth/confirm page and other client components
export const createClientComponentClient = () => supabaseBrowser;

