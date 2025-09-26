// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check if user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role_name")
      .eq("user_id", user.id)
      .in("role_name", ["Admin", "Senior Management"]);

    if (!roles || roles.length === 0) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const fixes = [];
    const errors = [];

    // Get all course assignments that are for trainees
    const { data: courseAssignments, error: caError } = await supabase
      .from("course_assignments")
      .select("user_id, course_id")
      .eq("role", "trainee");

    if (caError) {
      console.error("Error fetching course assignments:", caError);
      return NextResponse.json({ error: "Failed to fetch course assignments" }, { status: 500 });
    }

    // Group by user
    const userCourses = new Map();
    for (const ca of courseAssignments || []) {
      if (!userCourses.has(ca.user_id)) {
        userCourses.set(ca.user_id, []);
      }
      userCourses.get(ca.user_id).push(ca.course_id);
    }

    // For each user, check their authorizations
    for (const [userId, userCourseIds] of userCourses) {
      // Get all authorizations that contain any of the user's courses
      const { data: relevantAuths } = await supabase
        .from("authorisation_courses")
        .select("authorisation_id, course_id")
        .in("course_id", userCourseIds);

      if (!relevantAuths || relevantAuths.length === 0) continue;

      // Group by authorization
      const authMap = new Map();
      for (const ac of relevantAuths) {
        if (!authMap.has(ac.authorisation_id)) {
          authMap.set(ac.authorisation_id, []);
        }
        authMap.get(ac.authorisation_id).push(ac.course_id);
      }

      // For each authorization, check if user should have it
      for (const [authId, authCourseIds] of authMap) {
        // Check if user has ANY course from this authorization
        const hasAnyCourse = authCourseIds.some(courseId => userCourseIds.includes(courseId));
        
        if (hasAnyCourse) {
          // Check if authorization assignment exists
          const { data: existingAuth } = await supabase
            .from("authorisation_assignments")
            .select("id, assignment_status")
            .eq("user_id", userId)
            .eq("authorisation_id", authId)
            .eq("role", "trainee")
            .single();

          if (!existingAuth) {
            // Create the missing authorization assignment
            const { error: createError } = await supabase
              .from("authorisation_assignments")
              .insert({
                user_id: userId,
                authorisation_id: authId,
                role: 'trainee',
                assignment_status: 'assigned',
                assigned_by: user.id,
                assigned_at: new Date().toISOString(),
                created_by: user.id,
                created_at: new Date().toISOString()
              });

            if (createError) {
              errors.push(`Failed to create auth assignment for user ${userId} and auth ${authId}: ${createError.message}`);
            } else {
              fixes.push({
                action: "created",
                user_id: userId,
                authorisation_id: authId
              });
            }
          }

          // Now check if all courses are completed
          const { data: completedCourses } = await supabase
            .from("course_assignments")
            .select("course_id")
            .eq("user_id", userId)
            .eq("role", "trainee")
            .eq("assignment_status", "completed")
            .in("course_id", authCourseIds);

          const allCompleted = completedCourses?.length === authCourseIds.length && authCourseIds.length > 0;

          if (allCompleted) {
            // Get the authorization assignment (might be just created)
            const { data: authAssignment } = await supabase
              .from("authorisation_assignments")
              .select("id, assignment_status")
              .eq("user_id", userId)
              .eq("authorisation_id", authId)
              .eq("role", "trainee")
              .single();

            if (authAssignment && 
                authAssignment.assignment_status !== 'completed' && 
                authAssignment.assignment_status !== 'pending_approval') {
              // Update to pending_approval
              const { error: updateError } = await supabase
                .from("authorisation_assignments")
                .update({
                  assignment_status: 'pending_approval',
                  completed_at: new Date().toISOString()
                })
                .eq("id", authAssignment.id);

              if (updateError) {
                errors.push(`Failed to update auth ${authId} for user ${userId}: ${updateError.message}`);
              } else {
                fixes.push({
                  action: "updated_to_pending",
                  user_id: userId,
                  authorisation_id: authId
                });
              }
            }
          }
        }
      }
    }

    // Get user details for the fixes
    const fixedUserIds = [...new Set(fixes.map(f => f.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", fixedUserIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    // Get authorization details
    const fixedAuthIds = [...new Set(fixes.map(f => f.authorisation_id))];
    const { data: authorisations } = await supabase
      .from("authorisations")
      .select("id, title")
      .in("id", fixedAuthIds);

    const authMap = new Map((authorisations || []).map(a => [a.id, a]));

    // Format the fixes with user and auth details
    const detailedFixes = fixes.map(fix => ({
      ...fix,
      user_name: profileMap.get(fix.user_id)?.full_name || 'Unknown',
      user_email: profileMap.get(fix.user_id)?.email || 'Unknown',
      authorisation_title: authMap.get(fix.authorisation_id)?.title || 'Unknown'
    }));

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixes.length} authorization assignments`,
      fixes: detailedFixes,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        created: fixes.filter(f => f.action === "created").length,
        updated_to_pending: fixes.filter(f => f.action === "updated_to_pending").length,
        total: fixes.length
      }
    });

  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error.message 
    }, { status: 500 });
  }
}