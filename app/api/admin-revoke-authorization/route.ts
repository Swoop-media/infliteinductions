// @ts-nocheck
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { NextResponse } from "next/server";
import { logUserAudit } from "@/lib/audit";

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
      // Use 'expired' status - only valid values are: assigned, in_progress, pending_approval, completed, expired
      const { error: revokeError } = await supabase
        .from("authorisation_assignments")
        .update({
          assignment_status: 'expired'
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
      
      // Log the revocation details separately for audit trail
      console.log(`Authorization ${assignmentId} revoked by ${user.email} for user ${userId} with reason: ${reason || 'Revoked by admin'}`);
      
      // Store audit information in notifications as a workaround
      try {
        await supabase
          .from("notifications")
          .insert({
            user_id: userId,
            type: 'authorization_revoked',
            payload: {
              authorization_id: authorizationId,
              assignment_id: assignmentId,
              revoked_by: user.email,
              revoked_by_id: user.id,
              revoked_at: new Date().toISOString(),
              revoked_reason: reason || 'Revoked by admin',
              authorization_title: reason?.replace('Revoked by admin for ', '') || 'Authorization'
            },
            created_at: new Date().toISOString()
          });
      } catch (notifyError) {
        console.error('Failed to create revocation notification:', notifyError);
        // Continue even if notification fails
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

      // Audit trail (best-effort)
      try {
        const { data: revokedAuth } = authorizationId
          ? await supabase.from("authorisations").select("title").eq("id", authorizationId).maybeSingle()
          : { data: null };
        await logUserAudit({
          userId,
          actorId: user.id,
          action: "authorisation_revoked",
          details: {
            authorisation_id: authorizationId ?? null,
            authorisation_title: revokedAuth?.title ?? null,
            reason: reason || "Revoked by admin",
          },
        });
      } catch (auditErr) {
        console.error("Audit log failed for revocation:", auditErr);
      }

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

      // Audit trail (best-effort)
      try {
        const { data: revokedCourse } = courseId
          ? await supabase.from("courses").select("title").eq("id", courseId).maybeSingle()
          : { data: null };
        await logUserAudit({
          userId,
          actorId: user.id,
          action: "course_revoked",
          details: {
            course_id: courseId ?? null,
            course_title: revokedCourse?.title ?? null,
            reason: reason || "Revoked by admin",
          },
        });
      } catch (auditErr) {
        console.error("Audit log failed for course revocation:", auditErr);
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