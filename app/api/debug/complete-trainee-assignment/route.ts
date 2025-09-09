
// @ts-nocheck
import { NextResponse } from "next/server";
import { createSupabaseService } from "@/lib/supabase/service";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseService();
    const { courseId } = await req.json();

    console.log(`=== COMPLETING TRAINEE ASSIGNMENT FOR COURSE: ${courseId} ===`);

    // Get trainee assignment
    const { data: traineeAssignment } = await supabase
      .from("course_assignments")
      .select("id, assignment_status")
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    if (!traineeAssignment) {
      return NextResponse.json({ error: "No trainee assignment found" });
    }

    // Get all modules for this course
    const { data: allModules } = await supabase
      .from("course_modules")
      .select("id, title, type")
      .eq("course_id", courseId);

    // Get completed modules for this assignment
    // Explicit type annotation to prevent type inference issues
    const typedTraineeAssignment = traineeAssignment as { 
      id: string; 
      assignment_status: string 
    };
    
    const { data: completedModules } = await supabase
      .from("assignment_progress")
      .select("module_id")
      .eq("assignment_id", typedTraineeAssignment.id);

    const completedModuleIds = new Set(completedModules?.map(m => (m as any).module_id) || []);
    const totalModules = allModules?.length || 0;
    const completedCount = completedModules?.length || 0;

    console.log(`Trainee progress: ${completedCount}/${totalModules} modules completed`);

    // Check if all modules are completed
    const allModulesCompleted = completedCount >= totalModules && totalModules > 0;

    if (allModulesCompleted && typedTraineeAssignment.assignment_status !== "completed") {
      // Mark the trainee assignment as completed
      // Explicit type annotation to prevent type inference issues
      const updateData: any = {
        assignment_status: "completed",
        completed_at: new Date().toISOString()
      };
      
      const { error: updateError } = await supabase
        .from("course_assignments")
        .update(updateData)
        .eq("id", typedTraineeAssignment.id);

      if (updateError) {
        console.error("Error updating trainee assignment:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      console.log("Trainee assignment marked as completed");

      return NextResponse.json({ 
        success: true, 
        message: "Trainee assignment completed successfully",
        progress: {
          completed: completedCount,
          total: totalModules,
          status: "completed"
        }
      });
    } else {
      return NextResponse.json({ 
        success: true, 
        message: `Trainee assignment not yet complete: ${completedCount}/${totalModules} modules`,
        progress: {
          completed: completedCount,
          total: totalModules,
          status: traineeAssignment.assignment_status,
          missingModules: allModules?.filter(m => !completedModuleIds.has(m.id)).map(m => m.title) || []
        }
      });
    }

  } catch (error: any) {
    console.error("Complete trainee assignment error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
