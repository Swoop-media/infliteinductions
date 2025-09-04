
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
      return NextResponse.json({ error: "Forbidden - Admin role required" }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Use admin client to delete the user
    const admin = supabaseAdmin();

    // First, delete related data
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("course_assignments").delete().eq("user_id", userId);
    await admin.from("authorisation_assignments").delete().eq("user_id", userId);
    await admin.from("assignment_progress").delete().eq("user_id", userId);
    await admin.from("teams_links").delete().eq("user_id", userId);
    await admin.from("teams_link_codes").delete().eq("user_id", userId);
    await admin.from("notifications").delete().eq("user_id", userId);

    // Finally, delete the profile
    const { error: deleteError } = await admin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
