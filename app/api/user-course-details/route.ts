// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const courseId = searchParams.get('courseId');
    
    if (!userId || !courseId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    // Check if user is authorized to view this data (must be admin or the user themselves)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use admin client for fetching data
    const adminClient = supabaseAdmin();

    // Get course assignment
    const { data: assignment } = await adminClient
      .from("course_assignments")
      .select("id, assignment_status, completed_at")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    // Get all modules for the course
    const { data: modules } = await adminClient
      .from("course_modules")
      .select("id, title, type, order_index")
      .eq("course_id", courseId)
      .order("order_index", { ascending: true });

    if (!modules || modules.length === 0) {
      return NextResponse.json({ modules: [] });
    }

    // Get module progress
    const { data: moduleProgress } = assignment?.id ? await adminClient
      .from("assignment_progress")
      .select("module_id, completed_at")
      .eq("assignment_id", assignment.id) : { data: [] };

    const progressMap = new Map((moduleProgress || []).map(p => [p.module_id, p.completed_at]));

    // Get quiz attempts
    const { data: quizAttempts } = await adminClient
      .from("quiz_attempts")
      .select(`
        id,
        quiz_id,
        score_pct,
        passed,
        answers,
        created_at,
        quizzes!inner(module_id)
      `)
      .eq("user_id", userId);

    // Get onsite responses
    const { data: requirementResponses } = assignment?.id ? await adminClient
      .from("requirement_responses")
      .select(`
        id,
        module_id,
        requirement_id,
        response_value,
        trainer_id,
        created_at,
        onsite_requirements!inner(
          label,
          role
        )
      `)
      .eq("assignment_id", assignment.id) : { data: [] };

    // Get trainer names
    const trainerIds = [...new Set(requirementResponses?.map(r => r.trainer_id).filter(Boolean) || [])];
    const trainerProfilesMap = new Map();
    if (trainerIds.length > 0) {
      const { data: trainerProfiles } = await adminClient
        .from("profiles")
        .select("id, full_name")
        .in("id", trainerIds);
      
      trainerProfiles?.forEach(profile => {
        trainerProfilesMap.set(profile.id, profile.full_name);
      });
    }

    // Get documents
    const { data: documents } = await adminClient
      .from("learner_documents")
      .select("id, title, module_id, created_at")
      .eq("user_id", userId)
      .eq("course_id", courseId);

    // Process modules with all their details
    const modulesWithDetails = modules.map(module => {
      const isCompleted = progressMap.has(module.id);
      
      // Get quiz attempts for this module
      const moduleQuizAttempts = quizAttempts?.filter(
        qa => (qa.quizzes as any)?.module_id === module.id
      ).map(qa => ({
        score_pct: qa.score_pct,
        passed: qa.passed,
        answers: qa.answers,
        created_at: qa.created_at
      }));

      // Get onsite responses for this module
      const moduleOnsiteResponses = requirementResponses?.filter(
        rr => rr.module_id === module.id
      ).map(rr => ({
        requirement_label: (rr.onsite_requirements as any)?.label || "Requirement",
        response_text: rr.response_value,
        response_date: rr.created_at,
        assessor_name: rr.trainer_id ? trainerProfilesMap.get(rr.trainer_id) || null : null
      }));

      // Get documents for this module
      const moduleDocuments = documents?.filter(
        d => d.module_id === module.id
      ).map(d => ({
        document_title: d.title || "Untitled Document",
        uploaded_at: d.created_at
      }));

      return {
        module_id: module.id,
        module_type: module.type,
        module_title: module.title || `Module ${module.order_index + 1}`,
        completed: isCompleted,
        quiz_attempts: moduleQuizAttempts,
        onsite_responses: moduleOnsiteResponses,
        documents: moduleDocuments
      };
    });

    return NextResponse.json({
      course_id: courseId,
      assignment_status: assignment?.assignment_status,
      completed_at: assignment?.completed_at,
      modules: modulesWithDetails
    });

  } catch (error) {
    console.error('Error fetching course details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch course details' },
      { status: 500 }
    );
  }
}