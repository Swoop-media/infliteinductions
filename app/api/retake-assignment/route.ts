// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
      // Create a new course assignment for retaking
      const { data: newAssignment, error: assignmentError } = await adminClient
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

      if (assignmentError) {
        // If unique constraint error, the user already has an active assignment
        if (assignmentError.code === '23505') {
          return NextResponse.json({ 
            error: "An active assignment already exists for this course" 
          }, { status: 400 });
        }
        console.error("Error creating course assignment:", assignmentError);
        return NextResponse.json({ 
          error: "Failed to create new assignment",
          details: assignmentError.message 
        }, { status: 500 });
      }

      console.log("Created new course assignment for retake:", newAssignment.id);

      return NextResponse.json({ 
        success: true,
        type: 'course',
        assignmentId: newAssignment.id,
        courseId: courseId,
        message: "Course retake assignment created successfully"
      });

    } else if (type === "authorization") {
      // For authorization retake, we need to:
      // 1. Create a new authorization assignment
      // 2. Create new course assignments for all courses in the authorization
      
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

      // Create new authorization assignment
      const { data: newAuthAssignment, error: authAssignmentError } = await adminClient
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

      if (authAssignmentError) {
        if (authAssignmentError.code === '23505') {
          return NextResponse.json({ 
            error: "An active authorization assignment already exists" 
          }, { status: 400 });
        }
        console.error("Error creating authorization assignment:", authAssignmentError);
        return NextResponse.json({ 
          error: "Failed to create new authorization assignment",
          details: authAssignmentError.message 
        }, { status: 500 });
      }

      // Create new course assignments for all courses in the authorization
      const courseAssignments = authCourses.map(ac => ({
        user_id: user.id,
        course_id: ac.course_id,
        role: 'trainee',
        assignment_status: 'assigned',
        created_by: user.id,
        assigned_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      }));

      const { data: newCourseAssignments, error: courseAssignmentsError } = await adminClient
        .from("course_assignments")
        .insert(courseAssignments)
        .select();

      if (courseAssignmentsError) {
        // If we fail to create course assignments, rollback the authorization assignment
        await adminClient
          .from("authorisation_assignments")
          .delete()
          .eq("id", newAuthAssignment.id);

        console.error("Error creating course assignments for authorization:", courseAssignmentsError);
        
        if (courseAssignmentsError.code === '23505') {
          return NextResponse.json({ 
            error: "One or more courses already have active assignments" 
          }, { status: 400 });
        }
        
        return NextResponse.json({ 
          error: "Failed to create course assignments for authorization",
          details: courseAssignmentsError.message 
        }, { status: 500 });
      }

      console.log("Created new authorization assignment for retake:", newAuthAssignment.id);
      console.log("Created course assignments:", newCourseAssignments.length);

      return NextResponse.json({ 
        success: true,
        type: 'authorization',
        assignmentId: newAuthAssignment.id,
        authorizationId: authorizationId,
        courseAssignments: newCourseAssignments,
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