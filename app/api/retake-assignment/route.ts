// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { calculateAuthorizationExpiry } from "@/lib/utils/calculateAuthorizationExpiry";
import { recordAuthorisationCompletion, recordCourseCompletion } from "@/lib/training-history";

export async function POST(request: NextRequest) {
  try {
    const { type, courseId, authorizationId } = await request.json();
    
    const supabase = await createSupabaseServer();
    const adminClient = supabaseAdmin();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (type === "course") {
      // Guard: never (re)assign learners to unpublished (draft/archived) courses —
      // draft-course content is hidden from learners and surfaces as broken quizzes.
      const { data: courseStatusRow, error: courseStatusError } = await adminClient
        .from("courses")
        .select("id, title, status")
        .eq("id", courseId)
        .maybeSingle();
      if (courseStatusError || !courseStatusRow) {
        return NextResponse.json({ error: "Could not verify course status" }, { status: 500 });
      }
      if (courseStatusRow.status !== "published") {
        return NextResponse.json({
          error: `Cannot retake "${courseStatusRow.title}" while it is ${courseStatusRow.status}. Ask an admin to publish the course first.`
        }, { status: 400 });
      }

      // First check if an assignment already exists
      const { data: existingAssignment, error: checkError } = await adminClient
        .from("course_assignments")
        .select("id, assignment_status, completed_at, attempt_number")
        .eq("user_id", user.id)
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
          try {
            await recordCourseCompletion({
              assignmentId: existingAssignment.id,
              completedAt: existingAssignment.completed_at,
              actorId: user.id,
              reason: "retake",
              adminClient,
            });
          } catch (historyError: any) {
            console.error("Could not preserve course before retake:", historyError);
            return NextResponse.json(
              { error: historyError?.message || "Could not preserve completed training before retake" },
              { status: 500 }
            );
          }

          // Delete any existing progress records to start fresh
          const [progressDelete, responsesDelete] = await Promise.all([
            adminClient.from("assignment_progress").delete().eq("assignment_id", existingAssignment.id),
            adminClient.from("requirement_responses").delete().eq("assignment_id", existingAssignment.id),
          ]);
          const deleteProgressError = progressDelete.error || responsesDelete.error;

          if (deleteProgressError) {
            console.error("Error deleting progress records:", deleteProgressError);
          }

          // Update the existing assignment to reset it
          const { data: updatedAssignment, error: updateError } = await adminClient
            .from("course_assignments")
            .update({
              assignment_status: 'assigned',
              completed_at: null,
              attempt_number: (existingAssignment.attempt_number || 1) + 1,
              updated_at: new Date().toISOString()
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

          console.log("Reset existing course assignment for retake:", updatedAssignment.id);
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
            user_id: user.id,
            course_id: courseId,
            role: 'trainee',
            assignment_status: 'assigned',
            created_by: user.id,
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

        console.log("Created new course assignment for retake:", newAssignment.id);
        assignmentId = newAssignment.id;
      }

      return NextResponse.json({ 
        success: true,
        type: 'course',
        assignmentId: assignmentId,
        courseId: courseId,
        message: "Course retake assignment created successfully"
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

      // Guard: never (re)assign learners to unpublished (draft/archived) courses.
      // Missing course rows are treated as a failure, not implicitly allowed.
      {
        const linkedCourseIds = authCourses.map((ac: any) => ac.course_id);
        const { data: linkedCourses, error: linkedStatusError } = await adminClient
          .from("courses")
          .select("id, title, status")
          .in("id", linkedCourseIds);
        if (linkedStatusError || !linkedCourses || linkedCourses.length !== linkedCourseIds.length) {
          return NextResponse.json({ error: "Could not verify the status of all courses in this authorization" }, { status: 500 });
        }
        const unpublished = linkedCourses.filter((c: any) => c.status !== "published");
        if (unpublished.length > 0) {
          const names = unpublished.map((c: any) => `"${c.title}" (${c.status})`).join(", ");
          return NextResponse.json({
            error: `Cannot retake this authorization: it includes unpublished courses: ${names}. Ask an admin to publish them first.`
          }, { status: 400 });
        }
      }

      // Check if authorization assignment already exists
      const { data: existingAuthAssignment, error: checkAuthError } = await adminClient
        .from("authorisation_assignments")
        .select("id, assignment_status, completed_at, approved_at, approved_by, restrictions, expires_at, attempt_number")
        .eq("user_id", user.id)
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
          // Preserve the old completed (in-date) authorisation in history BEFORE
          // resetting anything, including the expiry it had at this moment.
          // The profile page keeps showing this snapshot as the user's current
          // authorisation until the retake is approved.
          try {
            await recordAuthorisationCompletion({
              assignmentId: existingAuthAssignment.id,
              actorId: user.id,
              reason: "retake",
              adminClient,
            });
          } catch (snapshotError: any) {
            console.error("[retake] Unexpected error snapshotting authorisation history:", snapshotError);
            return NextResponse.json({
              error: "Could not preserve your current authorisation before the retake. Please try again or contact an admin.",
              details: snapshotError?.message || String(snapshotError)
            }, { status: 500 });
          }

          // Update the existing authorization assignment to reset it
          const { data: updatedAuthAssignment, error: updateAuthError } = await adminClient
            .from("authorisation_assignments")
            .update({
              assignment_status: 'assigned',
              completed_at: null,
              attempt_number: (existingAuthAssignment.attempt_number || 1) + 1
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

          console.log("Reset existing authorization assignment for retake:", updatedAuthAssignment.id);
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
            user_id: user.id,
            authorisation_id: authorizationId,
            role: 'trainee',
            assignment_status: 'assigned',
            created_by: user.id,
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

        console.log("Created new authorization assignment for retake:", newAuthAssignment.id);
        authAssignmentId = newAuthAssignment.id;
      }

      // Now handle course assignments - reset or create each one
      const resetCourseAssignments = [];
      for (const authCourse of authCourses) {
        // Check if course assignment exists
        const { data: existingCourseAssignment, error: checkCourseError } = await adminClient
          .from("course_assignments")
            .select("id, assignment_status, completed_at, attempt_number")
          .eq("user_id", user.id)
          .eq("course_id", authCourse.course_id)
          .eq("role", 'trainee')
          .single();

        if (checkCourseError && checkCourseError.code !== 'PGRST116') {
          console.error("Error checking course assignment:", checkCourseError);
          continue;
        }

        if (existingCourseAssignment) {
          if (existingCourseAssignment.assignment_status === "completed" && existingCourseAssignment.completed_at) {
            try {
              await recordCourseCompletion({
                assignmentId: existingCourseAssignment.id,
                completedAt: existingCourseAssignment.completed_at,
                actorId: user.id,
                reason: "authorisation_retake",
                adminClient,
              });
            } catch (historyError: any) {
              return NextResponse.json(
                { error: historyError?.message || "Could not preserve completed course before retake" },
                { status: 500 }
              );
            }
          }

          // Delete any existing progress records
          await Promise.all([
            adminClient.from("assignment_progress").delete().eq("assignment_id", existingCourseAssignment.id),
            adminClient.from("requirement_responses").delete().eq("assignment_id", existingCourseAssignment.id),
          ]);

          // Update existing assignment
          const { data: updated } = await adminClient
            .from("course_assignments")
            .update({
              assignment_status: 'assigned',
              completed_at: null,
              attempt_number: (existingCourseAssignment.attempt_number || 1) + 1,
              updated_at: new Date().toISOString()
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
              user_id: user.id,
              course_id: authCourse.course_id,
              role: 'trainee',
              assignment_status: 'assigned',
              created_by: user.id,
              assigned_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            })
            .select()
            .single();

          if (newCourse) {
            resetCourseAssignments.push(newCourse);
          }
        }
      }

      console.log("Reset/created course assignments:", resetCourseAssignments.length);

      return NextResponse.json({ 
        success: true,
        type: 'authorization',
        assignmentId: authAssignmentId,
        authorizationId: authorizationId,
        courseAssignments: resetCourseAssignments,
        message: "Authorization retake assignment created successfully"
      });
    } else {
      return NextResponse.json({ 
        error: "Invalid type. Must be 'course' or 'authorization'" 
      }, { status: 400 });
    }

  } catch (error) {
    console.error("Error in retake assignment:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}