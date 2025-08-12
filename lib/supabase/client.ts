"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "./types";

/**
 * Client-side Supabase bound to Next.js auth-helpers.
 * This keeps the session in cookies so server components/middleware see it.
 */
export const supabaseBrowser = createClientComponentClient<Database>();

