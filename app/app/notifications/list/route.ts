import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ notifications: [] });

  // Try new schema first, fallback to old schema
  let { data, error } = await supabase
    .from("notifications")
    .select("id,type,title,body,data,read,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // If user_id column doesn't exist, try old schema
  if (error && error.code === "42703") {
    const result = await supabase
      .from("notifications")
      .select("id,type,payload,read,created_at")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    
    data = result.data;
    error = result.error;
  }

  if (error) return NextResponse.json({ notifications: [] });
  return NextResponse.json({ notifications: data ?? [] });
}
