// @ts-nocheck
import { NextResponse } from "next/server";
import { createSupabaseService } from "@/lib/supabase/service";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseService();
    const { userId, courseId, step } = await req.json();

    console.log(`=== TESTING MULTI-ROLE FLOW: ${step} ===`);

    if (step === "1_complete_digital") {
      // Step 1: Complete all digital modules for the trainee

      // Get trainee assignment
      const { data: assignment } = await supabase
        .from("course_assignments")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", courseId)
        .eq("role", "trainee")
        .single();

      if (!assignment) {
        return NextResponse.json({ error: "No trainee assignment found" });
      }

      // Get all digital modules
      const { data: digitalModules } = await supabase
        .from("course_modules")
        .select("id, title, type")
        .eq("course_id", courseId)
        .in("type", ["digital_training", "digital_assessment_quiz"]);

      // Mark all digital modules as complete
      for (const module of digitalModules || []) {
        await supabase
          .from("assignment_progress")
          .upsert({
            assignment_id: assignment.id,
            module_id: module.id,
            completed_at: new Date().toISOString()
          });
      }

      return NextResponse.json({ 
        success: true, 
        message: `Completed ${digitalModules?.length} digital modules`,
        nextStep: "2_complete_onsite_training"
      });
    }

    if (step === "2_complete_onsite_training") {
      // Step 2: Complete onsite training (trainer marks it complete)

      // Get trainer assignment
      const { data: trainerAssignment } = await supabase
        .from("course_assignments")
        .select("id")
        .eq("user_id", userId) // This should be the trainer's ID
        .eq("course_id", courseId)
        .eq("role", "onsite_trainer")
        .single();

      // Get trainee assignment (the one being trained)
      const { data: traineeAssignment } = await supabase
        .from("course_assignments")
        .select("id")
        .eq("course_id", courseId)
        .eq("role", "trainee")
        .single();

      if (!traineeAssignment) {
        return NextResponse.json({ error: "No trainee assignment found" });
      }

      // Get onsite training module
      const { data: onsiteModule } = await supabase
        .from("course_modules")
        .select("id, title")
        .eq("course_id", courseId)
        .eq("type", "onsite_training")
        .single();

      if (onsiteModule) {
        // Mark onsite training as complete for the trainee
        await supabase
          .from("assignment_progress")
          .upsert({
            assignment_id: traineeAssignment.id,
            module_id: onsiteModule.id,
            completed_at: new Date().toISOString()
          });
      }

      return NextResponse.json({ 
        success: true, 
        message: "Onsite training completed",
        nextStep: "3_complete_assessment"
      });
    }

    if (step === "3_complete_assessment") {
      // Step 3: Complete final assessment (assessor marks it complete)

      // Get trainee assignment
      const { data: traineeAssignment } = await supabase
        .from("course_assignments")
        .select("id")
        .eq("course_id", courseId)
        .eq("role", "trainee")
        .single();

      if (!traineeAssignment) {
        return NextResponse.json({ error: "No trainee assignment found" });
      }

      // Get onsite assessment module
      const { data: assessmentModule } = await supabase
        .from("course_modules")
        .select("id, title")
        .eq("course_id", courseId)
        .eq("type", "onsite_assessment")
        .single();

      if (assessmentModule) {
        // Mark assessment as complete for the trainee
        await supabase
          .from("assignment_progress")
          .upsert({
            assignment_id: traineeAssignment.id,
            module_id: assessmentModule.id,
            completed_at: new Date().toISOString()
          });

        // Mark the entire assignment as completed
        await supabase
          .from("course_assignments")
          .update({
            assignment_status: "completed",
            completed_at: new Date().toISOString()
          })
          .eq("id", traineeAssignment.id);
      }

      return NextResponse.json({ 
        success: true, 
        message: "Final assessment completed - Course fully complete!",
        nextStep: "complete"
      });
    }

    if (step === "2_check_assignments") {
      // First ensure Henry Morgan has onsite_trainer assignment
      const henryId = "1b44c8f5-95aa-4f8c-8110-8f36106b4d10";

      const { data: existingTrainer } = await supabase
        .from("course_assignments")
        .select("id")
        .eq("user_id", henryId)
        .eq("course_id", courseId)
        .eq("role", "onsite_trainer")
        .maybeSingle();

      if (!existingTrainer) {
        console.log("Creating onsite_trainer assignment for Henry Morgan");
        await supabase
          .from("course_assignments")
          .insert({
            user_id: henryId,
            course_id: courseId,
            role: "onsite_trainer",
            created_by: henryId,
            assignment_status: "assigned"
          });
      }

      // Check if all roles have completed their parts
      const { data: allAssignments } = await supabase
        .from("course_assignments")
        .select(`
          id,
          role,
          assignment_status,
          completed_at,
          user_id,
          profiles!course_assignments_user_id_fkey(full_name)
        `)
        .eq("course_id", courseId);

      // Count completed modules for each assignment
      const assignmentProgress = await Promise.all(
        (allAssignments || []).map(async (assignment) => {
          const { data: progress } = await supabase
            .from("assignment_progress")
            .select("module_id, completed_at")
            .eq("assignment_id", assignment.id);

          return {
            ...assignment,
            modules_completed: progress?.length || 0,
            progress: progress || []
          };
        })
      );

      return NextResponse.json({ 
        success: true, 
        message: "Onsite trainer assigned and completion status checked",
        assignments: assignmentProgress
      });
    }

    if (step === "3_trigger_notifications") {
      // Step 3: Manually create notification for onsite training
      const henryId = "1b44c8f5-95aa-4f8c-8110-8f36106b4d10";

      // Get learner info
      const { data: learner } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId)
        .single();

      // Get course info
      const { data: course } = await supabase
        .from("courses")
        .select("title")
        .eq("id", courseId)
        .single();

      // Get trainee assignment
      const { data: assignment } = await supabase
        .from("course_assignments")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", courseId)
        .eq("role", "trainee")
        .single();

      // Create notification manually
      const { data: notification, error: notifError } = await supabase
        .from("notifications")
        .insert({
          recipient_id: henryId,
          type: "onsite_training_ready",
          payload: {
            learner_id: userId,
            course_id: courseId,
            enrolment_id: assignment?.id,
            learnerName: learner?.full_name || learner?.email || "Unknown",
            learner_email: learner?.email,
            courseTitle: course?.title || "Unknown Course",
            course_title: course?.title || "Unknown Course",
            url: `${process.env.NEXT_PUBLIC_SITE_URL}/app/train-assess`,
            event_id: `onsite_ready_${userId}_${courseId}`
          },
          read: false
        })
        .select()
        .single();

      if (notifError) {
        return NextResponse.json({ 
          error: "Failed to create notification",
          details: notifError 
        });
      }

      return NextResponse.json({ 
        success: true, 
        message: "Notification created successfully",
        notification: notification,
        nextStep: "Check /app/train-assess and /app/admin/debug-notifications"
      });
    }

    return NextResponse.json({ error: "Invalid step" });

  } catch (error: any) {
    console.error("Multi-role flow test error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}