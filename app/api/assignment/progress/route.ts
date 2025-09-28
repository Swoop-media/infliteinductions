// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();

    // Must be logged in
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      console.log("Assignment progress: Unauthorized user");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const assignmentId = String(body.assignmentId || "");
    const moduleId = String(body.moduleId || "");
    const completed = body.completed !== undefined ? Boolean(body.completed) : true;

    console.log("Assignment progress request:", {
      userId: user.id,
      assignmentId,
      moduleId,
      completed
    });

    if (!assignmentId || !moduleId) {
      console.log("Assignment progress: Missing required fields");
      return NextResponse.json({ error: "Missing assignmentId or moduleId" }, { status: 400 });
    }

    // Use admin client to bypass RLS for assignment verification
    const adminClient = supabaseAdmin();
    
    // Get the assignment to verify it exists
  const { data: assignment, error: assignmentError } = await adminClient
    .from('course_assignments')
    .select('*')
    .eq('id', assignmentId)
    .single();

  if (assignmentError) {
    console.error('Assignment query error:', assignmentError);
    return NextResponse.json({
      error: 'Database error while fetching assignment',
      details: assignmentError.message
    }, { status: 500 });
  }

  if (!assignment) {
    console.error('No assignment found for ID:', assignmentId);
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

    // Verify user can manage this assignment (either as the trainee or as a trainer/assessor)
    const { data: assignmentCheck, error: assignmentErr } = await adminClient
      .from("course_assignments")
      .select("id, course_id, user_id")
      .eq("id", assignmentId)
      .single();

    console.log("Assignment verification:", {
      assignment: assignmentCheck,
      error: assignmentErr?.message
    });

    if (assignmentErr || !assignmentCheck) {
      console.log("Assignment progress: Assignment not found");
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Explicit type annotation to prevent type inference issues
    const typedAssignmentCheck = assignmentCheck as { 
      id: string; 
      course_id: string; 
      user_id: string; 
    };

    // Check if user is the trainee (owns the assignment) OR is a trainer/assessor for this course
    const isTrainee = typedAssignmentCheck.user_id === user.id;
    let isTrainerOrAssessor = false;

    if (!isTrainee) {
      const { data: trainerRoles } = await supabase
        .from("course_assignments")
        .select("role")
        .eq("user_id", user.id)
        .eq("course_id", typedAssignmentCheck.course_id)
        .in("role", ["onsite_trainer", "onsite_assessor"]);

      isTrainerOrAssessor = Boolean(trainerRoles && trainerRoles.length > 0);
    }

    if (!isTrainee && !isTrainerOrAssessor) {
      console.log("Assignment progress: User not authorized to manage this assignment");
      return NextResponse.json({ error: "Not authorized to manage this assignment" }, { status: 403 });
    }

    // Insert or update assignment progress
    if (completed) {
      // Explicit type annotation to prevent type inference issues
      const progressData: any = {
        assignment_id: assignmentId,
        module_id: moduleId,
        completed_at: new Date().toISOString()
      };

      // Use admin client to bypass RLS for trainers updating trainee progress
      const { error: upsertErr } = await adminClient
        .from("assignment_progress")
        .upsert(progressData, {
          onConflict: "assignment_id,module_id"
        });

      console.log("Assignment progress upsert:", {
        error: upsertErr?.message
      });

      if (upsertErr) {
        console.error("Assignment progress upsert error:", upsertErr);
        return NextResponse.json({ error: upsertErr.message }, { status: 400 });
      }

      // Try to complete the overall assignment if all modules are done
      try {
        // Explicit type annotation to prevent type inference issues
        const rpcParams: any = {
          p_assignment_id: assignmentId
        };
        await adminClient.rpc("try_complete_assignment", rpcParams);
      } catch (error) {
        console.warn("Failed to run try_complete_assignment RPC:", error);
      }

      // Check if this module completion should trigger course completion
      // Get all modules for this course
      const { data: allModules } = await adminClient
        .from("course_modules")
        .select("id")
        .eq("course_id", typedAssignmentCheck.course_id);
      
      const allModuleIds = allModules?.map(m => m.id) || [];
      
      // Check if all modules are now completed
      const { data: completedProgress } = await adminClient
        .from("assignment_progress")
        .select("module_id")
        .eq("assignment_id", assignmentId);
      
      const completedModuleIds = completedProgress?.map(p => p.module_id) || [];
      const allModulesCompleted = allModuleIds.length > 0 && 
                                   allModuleIds.every(id => completedModuleIds.includes(id));
      
      if (allModulesCompleted) {
        console.log("All modules completed, checking if course should be marked as complete");
        
        // Check current assignment status
        const { data: currentAssignment } = await adminClient
          .from("course_assignments")
          .select("assignment_status")
          .eq("id", assignmentId)
          .single();
        
        if (currentAssignment && currentAssignment.assignment_status !== 'completed') {
          // Mark the course assignment as completed
          const { error: completeError } = await adminClient
            .from("course_assignments")
            .update({
              assignment_status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq("id", assignmentId);
          
          if (!completeError) {
            console.log("Course assignment marked as completed");
            
            // Now check if authorization should be marked as pending_approval
            const { data: authCourses } = await adminClient
              .from("authorisation_courses")
              .select("authorisation_id")
              .eq("course_id", typedAssignmentCheck.course_id);

            if (authCourses && authCourses.length > 0) {
              for (const authCourse of authCourses) {
                const authId = authCourse.authorisation_id;
                
                // Get all courses for this authorization
                const { data: allAuthCourses } = await adminClient
                  .from("authorisation_courses")
                  .select("course_id")
                  .eq("authorisation_id", authId);

                const courseIds = allAuthCourses?.map(ac => ac.course_id) || [];
                
                // Check if all courses are completed for this user
                const { data: completedCourses } = await adminClient
                  .from("course_assignments")
                  .select("course_id")
                  .eq("user_id", typedAssignmentCheck.user_id)
                  .eq("role", "trainee")
                  .eq("assignment_status", "completed")
                  .in("course_id", courseIds);

                const allAuthCoursesCompleted = completedCourses?.length === courseIds.length && courseIds.length > 0;
                
                if (allAuthCoursesCompleted) {
                  // Check if there's an existing authorization assignment
                  const { data: existingAuth } = await adminClient
                    .from("authorisation_assignments")
                    .select("id, assignment_status")
                    .eq("user_id", typedAssignmentCheck.user_id)
                    .eq("authorisation_id", authId)
                    .eq("role", "trainee")
                    .single();

                  if (existingAuth && 
                      existingAuth.assignment_status !== 'completed' && 
                      existingAuth.assignment_status !== 'pending_approval') {
                    // Update authorization status to pending_approval
                    // Note: Removing updated_at to avoid PostgREST schema cache issues
                    const { error: authUpdateError } = await adminClient
                      .from("authorisation_assignments")
                      .update({
                        assignment_status: 'pending_approval',
                        completed_at: new Date().toISOString()
                      })
                      .eq("id", existingAuth.id);

                    if (!authUpdateError) {
                      console.log(`Authorization ${authId} updated to pending_approval`);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      completed,
      assignmentId,
      moduleId
    });

  } catch (error) {
    console.error("Assignment progress API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}