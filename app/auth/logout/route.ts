// @ts-nocheck
// app/auth/logout/route.ts
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Sign the user out and send them to the sign-in page with a banner */
async function signOutAndRedirect() {
  const supabase = await createSupabaseServer();
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore — we still redirect
  }
  redirect("/auth/signin?banner=logged_out");
}

export async function GET() {
  return signOutAndRedirect();
}

export async function POST() {
  return signOutAndRedirect();
}
