
import { NextResponse } from "next/server";
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

    // Use admin client to restore the user
    const admin = supabaseAdmin();
    
    // Restore the user profile by setting archived_at to null
    const { error: restoreError } = await admin
      .from("profiles")
      .update({ archived_at: null })
      .eq("id", userId);

    if (restoreError) {
      console.error("Restore error:", restoreError);
      return NextResponse.json({ error: "Failed to restore user" }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Restore user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
