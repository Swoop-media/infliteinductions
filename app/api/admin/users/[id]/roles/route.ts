// @ts-nocheck

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRoute } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const userId = resolvedParams.id;
    
    const supabase = await createSupabaseRoute();
    
    // Check if the requesting user is an admin
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin role
    const { data: isAdmin } = await supabase.rpc("has_role", {
      uid: user.id,
      role_name: "Admin"
    });
    
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    // Fetch user roles
    const { data: userRoles, error } = await supabase
      .from("user_roles")
      .select(`
        roles!inner(
          name
        )
      `)
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching user roles:", error);
      return NextResponse.json({ 
        error: "Failed to fetch user roles",
        details: error.message 
      }, { status: 500 });
    }

    // Extract role names
    const roleNames = (userRoles || []).map(ur => ur.roles?.name).filter(Boolean);

    return NextResponse.json({ 
      roles: roleNames,
      count: roleNames.length 
    });
  } catch (e: any) {
    console.error("Error fetching user roles:", e);
    return NextResponse.json({ 
      error: "Server error", 
      message: e.message 
    }, { status: 500 });
  }
}