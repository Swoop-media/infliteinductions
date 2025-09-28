// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Helper function to check and update authorization status
async function checkAndUpdateAuthorizationStatus(adminClient: any, userId: string, courseId: string) {
  try {
    console.log("Checking authorization completion for user:", userId, "course:", courseId);
    
    // Find all authorizations that include this course
    const { data: authCourses } = await adminClient
      .from("authorisation_courses")
      .select("authorisation_id")
      .eq("course_id", courseId);
    
    if (!authCourses || authCourses.length === 0) {
      console.log("No authorizations found for this course");
      return;
    }
    
    // For each authorization, check if all courses are completed
    for (const authCourse of authCourses) {
      const authId = authCourse.authorisation_id;
      
      // Get all courses for this authorization
      const { data: allAuthCourses } = await adminClient
        .from("authorisation_courses")
        .select("course_id")
        .eq("authorisation_id", authId);
      
      const courseIds = allAuthCourses?.map((ac: any) => ac.course_id) || [];
      
      if (courseIds.length === 0) continue;
      
      // Check if all courses are completed
      const { data: completedCourses } = await adminClient
        .from("course_assignments")
        .select("course_id")
        .eq("user_id", userId)
        .eq("role", "trainee")
        .eq("assignment_status", "completed")
        .in("course_id", courseIds);
      
      const allCoursesCompleted = completedCourses?.length === courseIds.length;
      
      console.log(`Authorization ${authId} status:`, {
        totalCourses: courseIds.length,
        completedCourses: completedCourses?.length || 0,
        allCompleted: allCoursesCompleted
      });
      
      if (allCoursesCompleted) {
        // Check if there's an existing authorization assignment
        const { data: existingAuth } = await adminClient
          .from("authorisation_assignments")
          .select("id, assignment_status")
          .eq("user_id", userId)
          .eq("authorisation_id", authId)
          .eq("role", "trainee")
          .single();
        
        if (existingAuth && existingAuth.assignment_status === "assigned") {
          // Update authorization status to pending_approval
          const { error: updateError } = await adminClient
            .from("authorisation_assignments")
            .update({
              assignment_status: "pending_approval",
              completed_at: new Date().toISOString()
            })
            .eq("id", existingAuth.id);
          
          if (updateError) {
            console.error("Error updating authorization status:", updateError);
          } else {
            console.log(`✅ Authorization ${authId} updated to pending_approval for user ${userId}`);
            
            // Send notification about authorization pending approval
            try {
              // Get authorization details for notification
              const { data: authDetails } = await adminClient
                .from("authorisations")
                .select("title")
                .eq("id", authId)
                .single();
              
              // Get user profile for notification
              const { data: userProfile } = await adminClient
                .from("profiles")
                .select("full_name, email")
                .eq("id", userId)
                .single();
              
              if (authDetails && userProfile) {
                // Send notifications to admins and trainers
                const { notifyRole } = await import("@/lib/notifications/dispatcher");
                await notifyRole(
                  "Authorization Approver",
                  "authorisation_pending_approval",
                  {
                    authorizationTitle: authDetails.title,
                    learnerName: userProfile.full_name || userProfile.email,
                    learner_email: userProfile.email,
                    assignmentId: existingAuth.id,
                    url: `/app/admin/review/${existingAuth.id}`
                  }
                );
                console.log("📧 Notification sent for pending authorization approval");
              }
            } catch (notifyError) {
              console.error("Failed to send notification:", notifyError);
              // Don't fail the update if notification fails
            }
          }
        } else if (existingAuth) {
          console.log(`Authorization already in status: ${existingAuth.assignment_status}`);
        }
      }
    }
  } catch (error) {
    console.error("Error checking authorization completion:", error);
    // Don't fail the module completion if authorization check fails
  }
}

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

    // Use admin client to bypass RLS
    const adminClient = supabaseAdmin();
    
    // Single optimized query to get assignment and check authorization
    const { data: assignmentCheck, error: assignmentErr } = await adminClient
      .from("course_assignments")
      .select("id, course_id, user_id, role")
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

    // Check if user is authorized (trainee or trainer/assessor)
    const isTrainee = assignmentCheck.user_id === user.id;
    let isAuthorized = isTrainee;

    if (!isTrainee) {
      // Single query to check trainer/assessor role
      const { data: trainerRole } = await supabase
        .from("course_assignments")
        .select("role")
        .eq("user_id", user.id)
        .eq("course_id", assignmentCheck.course_id)
        .in("role", ["onsite_trainer", "onsite_assessor"])
        .limit(1)
        .single();

      isAuthorized = Boolean(trainerRole);
    }

    if (!isAuthorized) {
      console.log("Assignment progress: User not authorized to manage this assignment");
      return NextResponse.json({ error: "Not authorized to manage this assignment" }, { status: 403 });
    }

    // Insert or update assignment progress
    if (completed) {
      const progressData = {
        assignment_id: assignmentId,
        module_id: moduleId,
        completed_at: new Date().toISOString()
      };

      // Upsert progress and check if course is complete in a single transaction
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

      // Check if all modules in the course are completed
      const { data: allModules } = await adminClient
        .from("course_modules")
        .select("id")
        .eq("course_id", assignmentCheck.course_id);
      
      const moduleIds = allModules?.map(m => m.id) || [];
      
      // Get all completed modules for this assignment
      const { data: completedProgress } = await adminClient
        .from("assignment_progress")
        .select("module_id")
        .eq("assignment_id", assignmentId)
        .not("completed_at", "is", null);
      
      const completedModuleIds = completedProgress?.map(p => p.module_id) || [];
      const allModulesCompleted = moduleIds.length > 0 && moduleIds.every(id => completedModuleIds.includes(id));
      
      console.log("Module completion check:", {
        totalModules: moduleIds.length,
        completedModules: completedModuleIds.length,
        allModulesCompleted
      });
      
      // If all modules are completed, mark the course assignment as completed
      if (allModulesCompleted) {
        const { error: courseUpdateError } = await adminClient
          .from("course_assignments")
          .update({
            assignment_status: "completed",
            completed_at: new Date().toISOString()
          })
          .eq("id", assignmentId);
        
        if (courseUpdateError) {
          console.error("Failed to update course assignment status:", courseUpdateError);
        } else {
          console.log("Course assignment marked as completed:", assignmentId);
          
          // Now check if this completes any authorizations
          await checkAndUpdateAuthorizationStatus(adminClient, assignmentCheck.user_id, assignmentCheck.course_id);
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