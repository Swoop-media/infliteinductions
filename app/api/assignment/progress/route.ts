import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Assignment progress API called");

    const supabase = await createSupabaseServer();
    const { assignmentId, moduleId } = await request.json();

    console.log("📝 Assignment progress request:", { assignmentId, moduleId });

    if (!assignmentId || !moduleId) {
      console.log("❌ Missing required fields");
      return NextResponse.json({ error: "assignmentId and moduleId required" }, { status: 400 });
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.log("❌ Authentication failed");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get assignment details (could be for current user or trainee)
    const { data: assignment, error: assignmentErr } = await supabase
      .from("course_assignments")
      .select("id, user_id, course_id, role")
      .eq("id", assignmentId)
      .single();

    console.log("🔍 Assignment verification:", {
      assignmentId,
      userId: user.id,
      found: !!assignment,
      assignment,
      error: assignmentErr?.message,
      errorCode: assignmentErr?.code
    });

    if (assignmentErr || !assignment) {
      console.log("❌ Assignment progress: Assignment not found");
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Check if user has permission to update this assignment
    let hasPermission = false;
    
    // Case 1: User owns the assignment (learner completing their own modules)
    if (assignment.user_id === user.id) {
      hasPermission = true;
      console.log("✅ User owns assignment");
    } else {
      // Case 2: User is trainer/assessor for this course
      const { data: trainerAssignments, error: trainerError } = await supabase
        .from("course_assignments")
        .select("role")
        .eq("user_id", user.id)
        .eq("course_id", assignment.course_id)
        .in("role", ["onsite_trainer", "onsite_assessor"]);
      
      console.log("🔍 Trainer permission check:", {
        userId: user.id,
        courseId: assignment.course_id,
        trainerAssignments,
        trainerError: trainerError?.message
      });
      
      if (trainerAssignments && trainerAssignments.length > 0) {
        hasPermission = true;
        console.log("✅ User is trainer/assessor for this course:", trainerAssignments);
      }
    }

    if (!hasPermission) {
      console.log("❌ Assignment progress: Access denied");
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Insert assignment progress (will be ignored if duplicate)
    const insertPayload = {
      assignment_id: assignmentId,
      module_id: moduleId,
      completed_at: new Date().toISOString()
    };

    console.log("💾 Attempting to insert assignment progress:", insertPayload);

    const { error: insertErr, data: insertData } = await supabase
      .from("assignment_progress")
      .insert(insertPayload)
      .select();

    const isDuplicate = insertErr?.message?.includes('duplicate') || insertErr?.code === '23505';

    console.log("📝 Assignment progress insert result:", {
      success: !insertErr,
      data: insertData,
      error: insertErr?.message,
      errorCode: insertErr?.code,
      isDuplicate,
      insertedCount: insertData?.length || 0
    });

    // If it's a duplicate, it's still a success from user perspective
    if (insertErr && !isDuplicate) {
      console.log("❌ Failed to insert assignment progress:", insertErr);
      return NextResponse.json({ error: "Failed to track progress" }, { status: 500 });
    }

    // Check if this completion triggers any notifications or progression
    await checkAndTriggerNotifications(supabase, assignment, moduleId, user.id);

    const response = {
      success: true,
      message: isDuplicate ? "Progress already recorded" : "Progress recorded successfully",
      duplicate: isDuplicate,
      insertedCount: insertData?.length || 0
    };

    console.log("✅ Assignment progress API response:", response);
    return NextResponse.json(response);
  } catch (e: any) {
    console.error("❌ Assignment progress POST error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function checkAndTriggerNotifications(supabase: any, assignment: any, completedModuleId: string, completedByUserId: string) {
  try {
    console.log("🔔 Checking for notification triggers...");

    const { createNotification } = await import("@/app/app/_actions/notifications");
    const courseId = assignment.course_id;
    const assignmentId = assignment.id;
    const userId = assignment.user_id;

    // Get course info
    const { data: course } = await supabase
      .from("courses")
      .select("title")
      .eq("id", courseId)
      .single();

    const courseTitle = course?.title || "Course";

    // Get all modules for this course by type
    const { data: allModules } = await supabase
      .from("course_modules")
      .select("id, type, title")
      .eq("course_id", courseId)
      .order("order_index");

    if (!allModules) return;

    const digitalModules = allModules.filter(m =>
      m.type === "digital_training" || m.type === "digital_assessment_quiz"
    );
    const onsiteTrainingModules = allModules.filter(m => m.type === "onsite_training");
    const onsiteAssessmentModules = allModules.filter(m => m.type === "onsite_assessment");

    // Get current assignment progress
    const { data: progress } = await supabase
      .from("assignment_progress")
      .select("module_id")
      .eq("assignment_id", assignmentId);

    const completedModuleIds = new Set(progress?.map(p => p.module_id) || []);

    console.log("📊 Progress analysis:", {
      courseId,
      digitalModules: digitalModules.length,
      onsiteTraining: onsiteTrainingModules.length,
      onsiteAssessment: onsiteAssessmentModules.length,
      completedCount: completedModuleIds.size,
      justCompleted: completedModuleId
    });

    // Check if all digital modules are complete (and we just completed one)
    const allDigitalComplete = digitalModules.length > 0 &&
      digitalModules.every(m => completedModuleIds.has(m.id));
    const justCompletedDigital = digitalModules.some(m => m.id === completedModuleId);

    if (allDigitalComplete && justCompletedDigital) {
      console.log("🎓 All digital modules completed! Notifying onsite trainers...");
      await notifyOnsiteTrainers(supabase, createNotification, courseId, courseTitle, userId);
    }

    // Check if onsite training module just completed
    const justCompletedOnsiteTraining = onsiteTrainingModules.some(m => m.id === completedModuleId);
    if (justCompletedOnsiteTraining) {
      console.log("🏢 Onsite training module completed! Checking for next steps...");
      
      // Check if there are more onsite training modules to complete
      const remainingOnsiteTraining = onsiteTrainingModules.filter(m => !completedModuleIds.has(m.id));
      
      if (remainingOnsiteTraining.length === 0) {
        // All onsite training complete - check if onsite assessment exists
        if (onsiteAssessmentModules.length > 0) {
          console.log("🏢 All onsite training completed! Notifying onsite assessors...");
          await notifyOnsiteAssessors(supabase, createNotification, courseId, courseTitle, userId);
        } else {
          // No onsite assessment - course is complete
          console.log("🏆 Course completed (no onsite assessment)! Updating assignment status...");
          await completeCourseAssignment(supabase, createNotification, assignmentId, courseTitle, userId);
        }
      } else {
        console.log(`📚 ${remainingOnsiteTraining.length} onsite training modules remaining`);
      }
    }

    // Check if all modules are complete (full course completion)
    const allModulesComplete = allModules.every(m => completedModuleIds.has(m.id));
    if (allModulesComplete) {
      console.log("🏆 Full course completed! Updating assignment status and notifying trainee...");

      // Update assignment status to completed
      await supabase
        .from("course_assignments")
        .update({
          assignment_status: "completed",
          completed_at: new Date().toISOString()
        })
        .eq("id", assignmentId);

      // Notify trainee of completion
      await notifyTraineeCompletion(supabase, createNotification, courseTitle, userId);
    }

  } catch (error) {
    console.error("❌ Error checking notification triggers:", error);
  }
}

async function notifyOnsiteTrainers(supabase: any, createNotification: any, courseId: string, courseTitle: string, traineeUserId: string) {
  try {
    // Get onsite trainers for this course
    const { data: trainers } = await supabase
      .from("course_assignments")
      .select("user_id")
      .eq("course_id", courseId)
      .eq("role", "onsite_trainer");

    // Get trainee name - try profiles first, then auth.users
    let traineeName = "A trainee";
    let traineeEmail = "";
    
    const { data: traineeProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", traineeUserId)
      .single();
    
    if (traineeProfile?.full_name || traineeProfile?.email) {
      traineeName = traineeProfile.full_name || traineeProfile.email;
      traineeEmail = traineeProfile.email || "";
    } else {
      // Fallback to auth.users table
      const { data: authUser } = await supabase.auth.admin.getUserById(traineeUserId);
      if (authUser?.user?.email) {
        traineeName = authUser.user.user_metadata?.full_name || authUser.user.email;
        traineeEmail = authUser.user.email;
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    for (const trainer of trainers || []) {
      await createNotification({
        recipientUserId: trainer.user_id,
        type: "onsite_training_ready",
        title: `Onsite Training Ready: ${courseTitle}`,
        body: `${traineeName} has completed all digital modules for "${courseTitle}" and is ready for onsite training.`,
        data: {
          courseTitle,
          courseId,
          traineeUserId,
          traineeName,
          traineeEmail,
          learnerName: traineeName,
          learner_email: traineeEmail,
          url: `${siteUrl}/app/train-assess`,
          event_id: `onsite_training_ready_${courseId}_${traineeUserId}_${Date.now()}`
        },
        sendTeams: true
      });
    }

    console.log(`✅ Notified ${trainers?.length || 0} onsite trainers`);
  } catch (error) {
    console.error("❌ Error notifying onsite trainers:", error);
  }
}

async function notifyOnsiteAssessors(supabase: any, createNotification: any, courseId: string, courseTitle: string, traineeUserId: string) {
  try {
    // Get onsite assessors for this course
    const { data: assessors } = await supabase
      .from("course_assignments")
      .select("user_id")
      .eq("course_id", courseId)
      .eq("role", "onsite_assessor");

    // Get trainee name
    const { data: traineeProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", traineeUserId)
      .single();

    const traineeName = traineeProfile?.full_name || traineeProfile?.email || "A trainee";

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    for (const assessor of assessors || []) {
      await createNotification({
        recipientUserId: assessor.user_id,
        type: "onsite_assessment_ready",
        title: `Onsite Assessment Ready: ${courseTitle}`,
        body: `${traineeName} has completed onsite training for "${courseTitle}" and is ready for assessment.`,
        data: {
          courseTitle,
          courseId,
          traineeUserId,
          traineeName,
          url: `${siteUrl}/app/train-assess`,
          event_id: `onsite_assessment_ready_${courseId}_${traineeUserId}_${Date.now()}`
        },
        sendTeams: true
      });
    }

    console.log(`✅ Notified ${assessors?.length || 0} onsite assessors`);
  } catch (error) {
    console.error("❌ Error notifying onsite assessors:", error);
  }
}

async function completeCourseAssignment(supabase: any, createNotification: any, assignmentId: string, courseTitle: string, traineeUserId: string) {
  try {
    // Update assignment status to completed
    await supabase
      .from("course_assignments")
      .update({
        assignment_status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", assignmentId);

    // Notify trainee of completion
    await notifyTraineeCompletion(supabase, createNotification, courseTitle, traineeUserId);
    
    console.log("✅ Course assignment completed and trainee notified");
  } catch (error) {
    console.error("❌ Error completing course assignment:", error);
  }
}

async function notifyTraineeCompletion(supabase: any, createNotification: any, courseTitle: string, traineeUserId: string) {
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    await createNotification({
      recipientUserId: traineeUserId,
      type: "course_completed",
      title: `Course Completed: ${courseTitle}`,
      body: `Congratulations! You have successfully completed "${courseTitle}".`,
      data: {
        courseTitle,
        url: `${siteUrl}/app/myprofile`,
        event_id: `course_completed_${traineeUserId}_${Date.now()}`
      },
      sendTeams: true
    });

    console.log("✅ Notified trainee of course completion");
  } catch (error) {
    console.error("❌ Error notifying trainee completion:", error);
  }
}