import { NextResponse } from "next/server";
import { createSupabaseRoute } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true });

  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient_id", user.id)
    .eq("read", false);

  return NextResponse.json({ ok: true });
}
