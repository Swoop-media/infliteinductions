// lib/supabase/server.ts
import { cookies } from "next/headers";
import {
  createServerComponentClient,
  createServerActionClient,
  createRouteHandlerClient,
} from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/** For Server Components */
export async function createSupabaseServer(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies(); // Next 15: cookies() is async
  return createServerComponentClient<Database>({
    cookies: () => cookieStore,
  });
}

/** For Server Actions */
export async function createSupabaseAction(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  // @ts-expect-error: package typings can lag behind runtime
  return createServerActionClient<Database>({
    cookies: () => cookieStore,
  });
}

/** For Route Handlers (e.g., files under app route handlers) */
export async function createSupabaseRoute(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  return createRouteHandlerClient<Database>({
    cookies: () => cookieStore,
  });
}
