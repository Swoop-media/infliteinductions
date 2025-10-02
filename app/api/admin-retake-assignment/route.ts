// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

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
        .select("id, assignment_status")
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
          enrolled_at: new Date().toISOString(),
          status: "enrolled"
        }, {
          onConflict: 'user_id,course_id',
          ignoreDuplicates: false
        });

      if (enrollmentError) {
        console.error("Error updating course enrollment:", enrollmentError);
      }

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
        .select("id, assignment_status")
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
          // Update the existing authorization assignment to reset it
          const { data: updatedAuthAssignment, error: updateAuthError } = await adminClient
            .from("authorisation_assignments")
            .update({
              assignment_status: 'assigned',
              completed_at: null,
              updated_at: new Date().toISOString(),
              created_by: adminUser.id // Track which admin created the retake
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
          .select("id, assignment_status")
          .eq("user_id", userId)
          .eq("course_id", authCourse.course_id)
          .eq("role", 'trainee')
          .single();

        if (checkCourseError && checkCourseError.code !== 'PGRST116') {
          console.error("Error checking course assignment:", checkCourseError);
          continue;
        }

        if (existingCourseAssignment) {
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
            enrolled_at: new Date().toISOString(),
            status: "enrolled"
          }, {
            onConflict: 'user_id,course_id',
            ignoreDuplicates: false
          });
      }

      console.log(`Admin ${adminUser.id} reset/created ${resetCourseAssignments.length} course assignments for authorization retake`);

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