// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check if user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has admin role
    const { data: hasAdminRole, error: roleError } = await supabase.rpc("has_role", {
      uid: user.id,
      role_name: "Admin"
    });
    
    // Also check for Senior Management if not admin
    let hasSeniorRole = false;
    if (!hasAdminRole) {
      const { data: seniorCheck } = await supabase.rpc("has_role", {
        uid: user.id,
        role_name: "Senior Management"
      });
      hasSeniorRole = !!seniorCheck;
    }

    if (!hasAdminRole && !hasSeniorRole) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get all users with their Teams link status
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select(`
        id,
        email,
        full_name
      `)
      .order('full_name', { ascending: true });

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    // Get Teams links for all users
    const { data: teamsLinks, error: linksError } = await supabase
      .from("teams_links")
      .select("user_id, teams_user_id, conversation_ref, last_activity");

    if (linksError) {
      console.error("Error fetching teams links:", linksError);
    }

    // Create a map of user_id to teams link info
    const teamsLinkMap = new Map();
    if (teamsLinks) {
      teamsLinks.forEach(link => {
        teamsLinkMap.set(link.user_id, {
          has_teams_link: true,
          teams_user_id: link.teams_user_id,
          last_activity: link.last_activity,
          has_conversation_ref: !!link.conversation_ref
        });
      });
    }

    // Combine user data with teams link status
    const enrichedUsers = users?.map(user => ({
      ...user,
      has_teams_link: teamsLinkMap.has(user.id),
      teams_user_id: teamsLinkMap.get(user.id)?.teams_user_id || null,
      last_activity: teamsLinkMap.get(user.id)?.last_activity || null,
      has_conversation_ref: teamsLinkMap.get(user.id)?.has_conversation_ref || false
    })) || [];

    return NextResponse.json({ 
      users: enrichedUsers,
      total: enrichedUsers.length,
      linkedCount: enrichedUsers.filter(u => u.has_teams_link).length,
      unlinkedCount: enrichedUsers.filter(u => !u.has_teams_link).length
    });
    
  } catch (error: any) {
    console.error("Error in teams-link-test/users API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}