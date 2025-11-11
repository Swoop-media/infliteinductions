// @ts-nocheck
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const isAdmin = await hasRole("Admin");
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      );
    }

    const { type, userId, courseId, authorizationId, assignmentId, reason } = await request.json();

    if (!userId || !assignmentId) {
      return NextResponse.json(
        { error: "User ID and Assignment ID are required" },
        { status: 400 }
      );
    }

    // Get current admin user from regular client
    const regularSupabase = await createSupabaseServer();
    const { data: { user }, error: userError } = await regularSupabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Failed to get current user" },
        { status: 401 }
      );
    }

    // Use admin client to bypass schema cache issues for database operations
    const supabase = supabaseAdmin();

    if (type === "authorization") {
      // Revoke the authorization assignment
      const { error: revokeError } = await supabase
        .from("authorisation_assignments")
        .update({
          assignment_status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_by: user.id,
          revoked_reason: reason || 'Revoked by admin',
          updated_at: new Date().toISOString()
        })
        .eq('id', assignmentId)
        .eq('user_id', userId);

      if (revokeError) {
        console.error('Error revoking authorization:', revokeError);
        return NextResponse.json(
          { error: "Failed to revoke authorization" },
          { status: 500 }
        );
      }

      // Also mark all related course assignments as cancelled/revoked
      if (authorizationId) {
        // Get all courses for this authorization
        const { data: authCourses } = await supabase
          .from("authorisation_courses")
          .select("course_id")
          .eq("authorisation_id", authorizationId);

        if (authCourses && authCourses.length > 0) {
          const courseIds = authCourses.map(ac => ac.course_id);
          
          // Update all related course assignments
          await supabase
            .from("course_assignments")
            .update({
              assignment_status: 'cancelled',
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .in('course_id', courseIds)
            .eq('role', 'trainee');
        }
      }

      // Create a notification for the user
      await supabase
        .from("notifications")
        .insert({
          user_id: userId,
          type: 'authorization_revoked',
          payload: {
            authorization_title: reason?.replace('Revoked by admin for ', '') || 'Authorization',
            revoked_by: user.email,
            revoked_at: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        });

      return NextResponse.json({ 
        success: true,
        message: "Authorization revoked successfully"
      });
      
    } else if (type === "course") {
      // Revoke a single course assignment
      const { error: revokeError } = await supabase
        .from("course_assignments")
        .update({
          assignment_status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', assignmentId)
        .eq('user_id', userId);

      if (revokeError) {
        console.error('Error revoking course:', revokeError);
        return NextResponse.json(
          { error: "Failed to revoke course" },
          { status: 500 }
        );
      }

      return NextResponse.json({ 
        success: true,
        message: "Course revoked successfully"
      });
    }

    return NextResponse.json(
      { error: "Invalid type specified" },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error in revoke authorization:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}