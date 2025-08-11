"use client";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Client-side Supabase (use for sign-in/out and simple client ops) */
export const supabaseBrowser = createClient(url, anon);
