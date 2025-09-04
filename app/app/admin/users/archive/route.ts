import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has admin role
    const isAdmin = await hasRole(user.id, "Admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Use admin client to archive the user
    const admin = supabaseAdmin();

    // Archive the user profile
    const { error: archiveError } = await admin
      .from("profiles")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", userId);

    if (archiveError) {
      console.error("Archive error:", archiveError);
      return NextResponse.json({ error: "Failed to archive user" }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Archive user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}