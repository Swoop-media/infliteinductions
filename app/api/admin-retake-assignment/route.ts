// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { logUserAudit } from "@/lib/audit";
import { calculateAuthorizationExpiry } from "@/lib/utils/calculateAuthorizationExpiry";

// Best-effort history snapshot of a completed course assignment before it is
// reset for a retake. Never blocks the retake if it fails (e.g. migration 010
// not applied yet).
async function snapshotCourseAssignment(adminClient: any, assignment: any, adminId: string) {
  try {
    const { error } = await adminClient.from("course_assignment_history").insert({
      assignment_id: assignment.id,
      user_id: assignment.user_id,
      course_id: assignment.course_id,
      assignment_status: assignment.assignment_status,
      completed_at: assignment.completed_at,
      superseded_by: adminId,
      reason: "retake",
    });
    if (error) console.error("[retake] Could not snapshot course assignment history:", error.message);
  } catch (e) {
    console.error("[retake] Unexpected error snapshotting course history:", e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { type, userId, courseId, authorizationId } = await request.json();
    
    const supabase = await createSupabaseServer();
    const adminClient = supabaseAdmin();

    // Check if the current user is an admin
    const isAdmin = await hasRole("Admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
    }

    // Get the admin user for logging purposes
    const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !adminUser) {
      return NextResponse.json({ error: "Admin authentication failed" }, { status: 401 });
    }

    if (type === "course") {
      // First check if an assignment already exists
      const { data: existingAssignment, error: checkError } = await adminClient
        .from("course_assignments")
        .select("id, assignment_status, completed_at, user_id, course_id")
        .eq("user_id", userId)
        .eq("course_id", courseId)
        .eq("role", 'trainee')
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error("Error checking existing assignment:", checkError);
        return NextResponse.json({ 
          error: "Failed to check existing assignment",
          details: checkError.message 
        }, { status: 500 });
      }

      let assignmentId: string;

      if (existingAssignment) {
        // If assignment exists and is completed, reset it for retaking
        if (existingAssignment.assignment_status === 'completed') {
          // Preserve the old completed record in the user's training history
          await snapshotCourseAssignment(adminClient, existingAssignment, adminUser.id);

          // Delete any existing progress records to start fresh
          const { error: deleteProgressError } = await adminClient
            .from("assignment_progress")
            .delete()
            .eq("assignment_id", existingAssignment.id);

          if (deleteProgressError) {
            console.error("Error deleting progress records:", deleteProgressError);
          }

          // Update the existing assignment to reset it
          const { data: updatedAssignment, error: updateError } = await adminClient
            .from("course_assignments")
            .update({
              assignment_status: 'assigned',
              completed_at: null,
              updated_at: new Date().toISOString(),
              created_by: adminUser.id // Track which admin created the retake
            })
            .eq("id", existingAssignment.id)
            .select()
            .single();

          if (updateError) {
            console.error("Error updating course assignment:", updateError);
            return NextResponse.json({ 
              error: "Failed to reset assignment for retaking",
              details: updateError.message 
            }, { status: 500 });
          }

          console.log(`Admin ${adminUser.id} reset course assignment for retake:`, updatedAssignment.id);
          assignmentId = updatedAssignment.id;
        } else {
          // Assignment exists but is not completed, cannot retake
          return NextResponse.json({ 
            error: "Cannot retake - course is currently in progress" 
          }, { status: 400 });
        }
      } else {
        // No existing assignment, create a new one
        const { data: newAssignment, error: createError } = await adminClient
          .from("course_assignments")
          .insert({
            user_id: userId,
            course_id: courseId,
            role: 'trainee',
            assignment_status: 'assigned',
            created_by: adminUser.id, // Track which admin created this
            assigned_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          console.error("Error creating course assignment:", createError);
          return NextResponse.json({ 
            error: "Failed to create new assignment",
            details: createError.message 
          }, { status: 500 });
        }

        console.log(`Admin ${adminUser.id} created new course assignment for retake:`, newAssignment.id);
        assignmentId = newAssignment.id;
      }

      // Also create or update course enrollment
      const { error: enrollmentError } = await adminClient
        .from("course_enrolments")
        .upsert({
          user_id: userId,
          course_id: courseId,
          status: "approved"
        }, {
          onConflict: 'user_id,course_id',
          ignoreDuplicates: false
        });

      if (enrollmentError) {
        console.error("Error updating course enrollment:", enrollmentError);
      }

      // Audit trail
      const { data: retakeCourse } = await adminClient
        .from("courses").select("title").eq("id", courseId).maybeSingle();
      await logUserAudit({
        userId,
        actorId: adminUser.id,
        action: "course_retake",
        details: { course_id: courseId, course_title: retakeCourse?.title ?? null },
      });

      return NextResponse.json({ 
        success: true,
        type: 'course',
        assignmentId: assignmentId,
        courseId: courseId,
        adminId: adminUser.id,
        message: "Course retake assignment created successfully by admin"
      });

    } else if (type === "authorization") {
      // First, get all courses for this authorization
      const { data: authCourses, error: authCoursesError } = await adminClient
        .from("authorisation_courses")
        .select("course_id, order_index")
        .eq("authorisation_id", authorizationId)
        .order("order_index", { ascending: true });

      if (authCoursesError) {
        console.error("Error fetching authorization courses:", authCoursesError);
        return NextResponse.json({ 
          error: "Failed to fetch authorization courses",
          details: authCoursesError.message 
        }, { status: 500 });
      }

      if (!authCourses || authCourses.length === 0) {
        return NextResponse.json({ 
          error: "No courses found for this authorization" 
        }, { status: 400 });
      }

      // Check if authorization assignment already exists
      const { data: existingAuthAssignment, error: checkAuthError } = await adminClient
        .from("authorisation_assignments")
        .select("id, assignment_status, completed_at, approved_at, approved_by, restrictions, user_id, authorisation_id")
        .eq("user_id", userId)
        .eq("authorisation_id", authorizationId)
        .eq("role", 'trainee')
        .single();

      if (checkAuthError && checkAuthError.code !== 'PGRST116') {
        console.error("Error checking existing authorization assignment:", checkAuthError);
        return NextResponse.json({ 
          error: "Failed to check existing authorization assignment",
          details: checkAuthError.message 
        }, { status: 500 });
      }

      let authAssignmentId: string;

      if (existingAuthAssignment) {
        // If authorization assignment exists and is completed, reset it
        if (existingAuthAssignment.assignment_status === 'completed') {
          // Preserve the old completed authorisation in the user's training
          // history BEFORE resetting anything, including the expiry date it
          // had at this moment (computed while course completions still exist).
          try {
            const courseIdsForAuth = authCourses.map((ac: any) => ac.course_id);

            const { data: authRecord } = await adminClient
              .from("authorisations")
              .select("valid_for_days")
              .eq("id", authorizationId)
              .maybeSingle();

            const { data: authDocs } = await adminClient
              .from("learner_documents")
              .select("expires_on")
              .eq("user_id", userId)
              .in("course_id", courseIdsForAuth.length > 0 ? courseIdsForAuth : ["none"])
              .not("expires_on", "is", null)
              .or("status.is.null,status.neq.replaced");

            const { data: completedAuthCourses } = await adminClient
              .from("course_assignments")
              .select("course_id, completed_at, courses!course_assignments_course_id_fkey(valid_for_months)")
              .eq("user_id", userId)
              .eq("role", "trainee")
              .in("course_id", courseIdsForAuth.length > 0 ? courseIdsForAuth : ["none"])
              .not("completed_at", "is", null);

            const approvedAt = existingAuthAssignment.approved_at
              ? new Date(existingAuthAssignment.approved_at)
              : (existingAuthAssignment.completed_at ? new Date(existingAuthAssignment.completed_at) : new Date());

            const expiryDate = calculateAuthorizationExpiry(
              approvedAt,
              authRecord?.valid_for_days ?? null,
              (authDocs || []).map((d: any) => ({ expires_on: d.expires_on })),
              (completedAuthCourses || []).map((ca: any) => ({
                valid_for_months: ca.courses?.valid_for_months ?? null,
                completed_at: ca.completed_at,
              }))
            );

            const { error: historyError } = await adminClient
              .from("authorisation_assignment_history")
              .insert({
                assignment_id: existingAuthAssignment.id,
                user_id: userId,
                authorisation_id: authorizationId,
                assignment_status: existingAuthAssignment.assignment_status,
                completed_at: existingAuthAssignment.completed_at,
                approved_at: existingAuthAssignment.approved_at,
                approved_by: existingAuthAssignment.approved_by,
                restrictions: existingAuthAssignment.restrictions,
                expires_at: expiryDate ? expiryDate.toISOString() : null,
                superseded_by: adminUser.id,
                reason: "retake",
              });
            if (historyError) {
              // Do NOT reset the live authorisation if we could not preserve it —
              // that would remove the user's current in-date authorisation.
              console.error("[retake] Could not snapshot authorisation history:", historyError.message);
              return NextResponse.json({
                error: "Could not preserve the user's current authorisation before the retake. Please try again.",
                details: historyError.message
              }, { status: 500 });
            }
          } catch (snapshotError: any) {
            console.error("[retake] Unexpected error snapshotting authorisation history:", snapshotError);
            return NextResponse.json({
              error: "Could not preserve the user's current authorisation before the retake. Please try again.",
              details: snapshotError?.message || String(snapshotError)
            }, { status: 500 });
          }

          // Update the existing authorization assignment to reset it
          const { data: updatedAuthAssignment, error: updateAuthError } = await adminClient
            .from("authorisation_assignments")
            .update({
              assignment_status: 'assigned',
              completed_at: null,
              created_by: adminUser.id
            })
            .eq("id", existingAuthAssignment.id)
            .select()
            .single();

          if (updateAuthError) {
            console.error("Error updating authorization assignment:", updateAuthError);
            return NextResponse.json({ 
              error: "Failed to reset authorization assignment for retaking",
              details: updateAuthError.message 
            }, { status: 500 });
          }

          console.log(`Admin ${adminUser.id} reset authorization assignment for retake:`, updatedAuthAssignment.id);
          authAssignmentId = updatedAuthAssignment.id;
        } else {
          // Authorization assignment exists but is not completed
          return NextResponse.json({ 
            error: "Cannot retake - authorization is currently in progress" 
          }, { status: 400 });
        }
      } else {
        // No existing authorization assignment, create a new one
        const { data: newAuthAssignment, error: createAuthError } = await adminClient
          .from("authorisation_assignments")
          .insert({
            user_id: userId,
            authorisation_id: authorizationId,
            role: 'trainee',
            assignment_status: 'assigned',
            created_by: adminUser.id, // Track which admin created this
            assigned_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createAuthError) {
          console.error("Error creating authorization assignment:", createAuthError);
          return NextResponse.json({ 
            error: "Failed to create new authorization assignment",
            details: createAuthError.message 
          }, { status: 500 });
        }

        console.log(`Admin ${adminUser.id} created new authorization assignment for retake:`, newAuthAssignment.id);
        authAssignmentId = newAuthAssignment.id;
      }

      // Now handle course assignments - reset or create each one
      const resetCourseAssignments = [];
      for (const authCourse of authCourses) {
        // Check if course assignment exists
        const { data: existingCourseAssignment, error: checkCourseError } = await adminClient
          .from("course_assignments")
          .select("id, assignment_status, completed_at, user_id, course_id")
          .eq("user_id", userId)
          .eq("course_id", authCourse.course_id)
          .eq("role", 'trainee')
          .single();

        if (checkCourseError && checkCourseError.code !== 'PGRST116') {
          console.error("Error checking course assignment:", checkCourseError);
          continue;
        }

        if (existingCourseAssignment) {
          // Preserve old completed course records in the training history
          if (existingCourseAssignment.assignment_status === 'completed' && existingCourseAssignment.completed_at) {
            await snapshotCourseAssignment(adminClient, existingCourseAssignment, adminUser.id);
          }

          // Delete any existing progress records
          await adminClient
            .from("assignment_progress")
            .delete()
            .eq("assignment_id", existingCourseAssignment.id);

          // Update existing assignment
          const { data: updated } = await adminClient
            .from("course_assignments")
            .update({
              assignment_status: 'assigned',
              completed_at: null,
              updated_at: new Date().toISOString(),
              created_by: adminUser.id // Track which admin created the retake
            })
            .eq("id", existingCourseAssignment.id)
            .select()
            .single();

          if (updated) {
            resetCourseAssignments.push(updated);
          }
        } else {
          // Create new course assignment
          const { data: newCourse } = await adminClient
            .from("course_assignments")
            .insert({
              user_id: userId,
              course_id: authCourse.course_id,
              role: 'trainee',
              assignment_status: 'assigned',
              created_by: adminUser.id, // Track which admin created this
              assigned_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            })
            .select()
            .single();

          if (newCourse) {
            resetCourseAssignments.push(newCourse);
          }
        }

        // Also create or update course enrollment
        await adminClient
          .from("course_enrolments")
          .upsert({
            user_id: userId,
            course_id: authCourse.course_id,
            status: "approved"
          }, {
            onConflict: 'user_id,course_id',
            ignoreDuplicates: false
          });
      }

      console.log(`Admin ${adminUser.id} reset/created ${resetCourseAssignments.length} course assignments for authorization retake`);

      // Audit trail
      const { data: retakeAuth } = await adminClient
        .from("authorisations").select("title").eq("id", authorizationId).maybeSingle();
      await logUserAudit({
        userId,
        actorId: adminUser.id,
        action: "authorisation_retake",
        details: {
          authorisation_id: authorizationId,
          authorisation_title: retakeAuth?.title ?? null,
          courses_reset: resetCourseAssignments.length,
        },
      });

      return NextResponse.json({ 
        success: true,
        type: 'authorization',
        assignmentId: authAssignmentId,
        authorizationId: authorizationId,
        courseAssignments: resetCourseAssignments,
        adminId: adminUser.id,
        message: "Authorization retake assignment created successfully by admin"
      });
    } else {
      return NextResponse.json({ 
        error: "Invalid type. Must be 'course' or 'authorization'" 
      }, { status: 400 });
    }

  } catch (error) {
    console.error("Error in admin retake assignment:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}