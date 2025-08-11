"use server";

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "./types";

/** Server-side Supabase client bound to Next cookies */
export function createSupabaseServer() {
  return createServerComponentClient<Database>({ cookies });
}
