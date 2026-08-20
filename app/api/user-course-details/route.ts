// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPinnedCourseContext } from "@/lib/course-version";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const courseId = searchParams.get('courseId');
    const requestedAssignmentId = searchParams.get('assignmentId') || undefined;

    if (!userId || !courseId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Server-side authorization for this service-role data access (do NOT rely
    // on page-level gating). Only the subject user may read their own details,
    // OR a caller with the Admin role (matching both current admin consumers).
    if (user.id !== userId) {
      const { data: hasAdminRole } = await supabase.rpc("has_role", {
        uid: user.id,
        role_name: "Admin",
      });
      if (!hasAdminRole) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Use admin client for fetching data
    const adminClient = supabaseAdmin();

    // Get course assignment - don't fail if not found (might be viewing completed course without active assignment)
    const { data: assignment } = await adminClient
      .from("course_assignments")
      .select("id, assignment_status, completed_at, course_version_id, attempt_number")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .maybeSingle();

    // Resolve the selected trainee assignment's immutable pinned version and
    // render module/quiz definitions from its snapshot rather than mutable live
    // content. Fail closed if the pinned version cannot be loaded.
    let pinnedContext: any;
    try {
      pinnedContext = await getPinnedCourseContext(adminClient, {
        assignmentId: requestedAssignmentId,
        userId,
        courseId,
      });
    } catch (pinnedError: any) {
      console.error("Pinned course version unavailable:", pinnedError);
      return NextResponse.json(
        { error: pinnedError?.message || "Pinned course version is unavailable" },
        { status: 404 }
      );
    }

    // The pinned context resolves the definitive assignment for this snapshot.
    const pinnedAssignment = pinnedContext.assignment;
    const selectedAssignmentId = pinnedAssignment.id;
    const selectedVersionId = pinnedAssignment.course_version_id;
    const selectedAttemptNumber = pinnedAssignment.attempt_number ?? null;

    // Build the module list from the immutable snapshot.modules, preserving the
    // pinned ordering and definitions.
    const modules = (pinnedContext.modules || [])
      .slice()
      .sort(
        (a: any, b: any) =>
          (a?.order_index ?? 0) - (b?.order_index ?? 0)
      )
      .map((m: any) => ({
        id: m.id,
        title: m.title,
        type: m.type,
        order_index: m.order_index,
        include_equipment_assessment: m.include_equipment_assessment,
      }));

    if (!modules || modules.length === 0) {
      // Return an empty but valid response structure
      return NextResponse.json({
        course_id: courseId,
        assignment_status:
          pinnedAssignment.assignment_status ||
          assignment?.assignment_status ||
          'completed',
        completed_at:
          pinnedAssignment.completed_at || assignment?.completed_at || null,
        modules: []
      });
    }

    // Get module progress (scoped to the selected pinned assignment)
    const { data: moduleProgress } = selectedAssignmentId ? await adminClient
      .from("assignment_progress")
      .select("module_id, completed_at")
      .eq("assignment_id", selectedAssignmentId) : { data: [] };

    const progressMap = new Map((moduleProgress || []).map(p => [p.module_id, p.completed_at]));

    // Get module IDs for later queries
    const moduleIds = modules.map(m => m.id);

    // Derive quiz definitions (quizzes, questions, options) from the pinned
    // snapshot.modules instead of mutable live tables.
    const quizzes: any[] = [];
    const quizQuestions: any[] = [];
    const quizOptions: any[] = [];
    const allRequirements: any[] = [];

    for (const snapModule of pinnedContext.modules || []) {
      // Onsite requirements from the pinned snapshot
      for (const req of (snapModule.onsite_requirements || [])) {
        allRequirements.push({
          id: req.id,
          module_id: snapModule.id,
          label: req.label,
          field_type: req.field_type,
          required: req.required,
          role: req.role,
          order_index: req.order_index,
        });
      }

      // Quizzes / questions / options from the pinned snapshot
      for (const quiz of (snapModule.quizzes || [])) {
        quizzes.push({
          id: quiz.id,
          module_id: quiz.module_id ?? snapModule.id,
          course_id: quiz.course_id ?? courseId,
          pass_mark: quiz.pass_mark ?? 70,
        });

        for (const q of (quiz.questions || [])) {
          quizQuestions.push({
            id: q.id,
            quiz_id: q.quiz_id ?? quiz.id,
            module_id: snapModule.id,
            stem: q.stem,
            prompt: q.prompt,
            explanation: q.explanation,
            points: q.points,
            order_index: q.order_index,
            kind: q.kind,
            type: q.type,
          });

          for (const opt of (q.options || [])) {
            quizOptions.push({
              id: opt.id,
              question_id: opt.question_id ?? q.id,
              label: opt.label ?? opt.text ?? "",
              is_correct: opt.is_correct ?? opt.correct ?? false,
              order_index: opt.order_index ?? opt.position ?? 0,
            });
          }
        }
      }
    }

    allRequirements.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    const quizIds = quizzes.map(q => q.id);

    // Get quiz attempts, filtered to the selected assignment where possible.
    // The immutable link is (quiz_id in pinned quizzes) + assignment_id; where
    // legacy attempts lack an assignment_id we still surface them by user/quiz.
    let quizAttemptQuery = adminClient
      .from("quiz_attempts")
      .select(`
        id,
        quiz_id,
        assignment_id,
        course_version_id,
        attempt_number,
        score_pct,
        passed,
        answers,
        created_at,
        quizzes!inner(module_id, pass_mark)
      `)
      .eq("user_id", userId);

    if (quizIds.length > 0) {
      quizAttemptQuery = quizAttemptQuery.in("quiz_id", quizIds);
    }
    // Scope attempts to this assignment/version/attempt where the immutable
    // columns are populated; legacy rows (null links) are still surfaced.
    if (selectedAssignmentId) {
      quizAttemptQuery = quizAttemptQuery.or(
        `assignment_id.eq.${selectedAssignmentId},assignment_id.is.null`
      );
    }
    if (selectedVersionId) {
      quizAttemptQuery = quizAttemptQuery.or(
        `course_version_id.eq.${selectedVersionId},course_version_id.is.null`
      );
    }
    if (selectedAttemptNumber != null) {
      quizAttemptQuery = quizAttemptQuery.or(
        `attempt_number.eq.${selectedAttemptNumber},attempt_number.is.null`
      );
    }

    const { data: quizAttempts } = await quizAttemptQuery;

    // Get all requirement responses (scoped to the selected pinned assignment)
    const { data: requirementResponses } = selectedAssignmentId ? await adminClient
      .from("requirement_responses")
      .select(`
        id,
        module_id,
        requirement_id,
        response_value,
        trainer_id,
        created_at
      `)
      .eq("assignment_id", selectedAssignmentId) : { data: [] };

    // Create a map of responses by requirement_id
    const responseMap = new Map();
    requirementResponses?.forEach(response => {
      responseMap.set(response.requirement_id, response);
    });

    // Get modules with equipment assessment enabled
    const modulesWithEquipment = modules.filter(m => m.include_equipment_assessment);
    
    // Equipment templates from the pinned snapshot (course-level definition).
    const equipmentTemplates = (pinnedContext.equipmentTemplates || [])
      .slice()
      .sort((a: any, b: any) => (a?.order_index || 0) - (b?.order_index || 0))
      .map((et: any) => ({
        id: et.id,
        equipment_name: et.equipment_name,
        description: et.description,
        required: et.required,
        category: et.category,
        order_index: et.order_index,
      }));

    // Equipment form blocks from the pinned snapshot module content_blocks.
    const equipmentBlocks: any[] = [];
    for (const snapModule of pinnedContext.modules || []) {
      for (const block of (snapModule.content_blocks || [])) {
        if (block?.kind === "equipment_form") {
          equipmentBlocks.push({
            id: block.id,
            module_id: snapModule.id,
            kind: block.kind,
            data: block.data,
            order_index: block.order_index,
          });
        }
      }
    }

    // Get equipment form responses (trainee responses)
    const { data: equipmentResponses } = await adminClient
      .from("trainee_equipment_responses")
      .select(`
        equipment_id,
        response_text,
        created_at,
        user_id,
        course_id
      `)
      .eq("user_id", userId);

    // Get assessor equipment confirmations (for equipment assessment modules)
    const { data: equipmentConfirmations } = await adminClient
      .from("assessor_equipment_confirmations")
      .select(`
        equipment_id,
        confirmed,
        assessor_notes,
        created_at,
        assessor_id,
        trainee_id
      `)
      .eq("trainee_id", userId);
    
    // Create a map of equipment responses (combine both sources)
    const equipmentResponseMap = new Map();
    equipmentResponses?.forEach(response => {
      equipmentResponseMap.set(response.equipment_id, response);
    });
    
    // Add assessor confirmations to the map
    equipmentConfirmations?.forEach(confirmation => {
      if (confirmation.confirmed) {
        equipmentResponseMap.set(confirmation.equipment_id, {
          response_text: confirmation.assessor_notes || 'Confirmed',
          created_at: confirmation.created_at
        });
      }
    });

    // Get form responses (new structure with form_instances and form_items)
    const { data: formResponses } = await adminClient
      .from("form_responses")
      .select(`
        *,
        form_items!inner (
          id,
          stable_id,
          equipment_name,
          description,
          required,
          instance_id,
          form_instances!inner (
            id,
            course_id,
            module_id,
            title
          )
        )
      `)
      .eq("user_id", userId)
      .eq("is_latest", true);

    // Create a map of form responses by item stable_id
    const formResponseMap = new Map();
    formResponses?.forEach(response => {
      const moduleId = response.form_items?.form_instances?.module_id;
      if (moduleId) {
        const key = `${moduleId}_${response.form_items.stable_id}`;
        formResponseMap.set(key, response);
      }
    });

    // Get all form instances for modules to show all questions (not just answered ones)
    const { data: formInstances } = await adminClient
      .from("form_instances")
      .select(`
        id,
        module_id,
        title,
        kind,
        form_items (
          id,
          stable_id,
          equipment_name,
          description,
          required
        )
      `)
      .in("module_id", moduleIds);
    
    // Create a map of form items by module
    const formItemsByModule = new Map();
    formInstances?.forEach(instance => {
      if (!formItemsByModule.has(instance.module_id)) {
        formItemsByModule.set(instance.module_id, []);
      }
      if (instance.form_items && Array.isArray(instance.form_items)) {
        formItemsByModule.get(instance.module_id).push(...instance.form_items.map(item => ({
          ...item,
          instance_id: instance.id
        })));
      }
    });

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
      .select("id, title, module_id, created_at, file_path")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .or("status.is.null,status.neq.replaced");

    // Process modules with all their details
    const modulesWithDetails = modules.map(module => {
      const isCompleted = progressMap.has(module.id);
      
      // Find quiz for this module
      const moduleQuiz = quizzes?.find(q => 
        q.module_id === module.id || 
        (!q.module_id && q.course_id === courseId)
      );
      
      // Get quiz questions for this module
      const moduleQuizQuestions = (quizQuestions || []).filter(q => 
        (moduleQuiz && q.quiz_id === moduleQuiz.id) ||
        q.module_id === module.id
      ).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      
      // Map questions with their options
      const questionsWithOptions = moduleQuizQuestions.map(question => {
        const options = (quizOptions || [])
          .filter(opt => opt.question_id === question.id)
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        
        return {
          id: question.id,
          question_text: question.stem || question.prompt || `Question ${(question.order_index || 0) + 1}`,
          points: question.points || 1,
          options: options.map(opt => ({
            id: opt.id,
            label: opt.label || '',
            is_correct: opt.is_correct || false
          }))
        };
      });
      
      // Build quiz info
      const quizInfo = moduleQuiz ? {
        quiz_id: moduleQuiz.id,
        pass_mark: moduleQuiz.pass_mark || 70,
        questions: questionsWithOptions
      } : undefined;
      
      // Get quiz attempts for this module
      const moduleQuizAttempts = quizAttempts?.filter(
        qa => (qa.quizzes as any)?.module_id === module.id
      ).map(qa => {
        const quiz = qa.quizzes as any;
        return {
          score_pct: qa.score_pct,
          passed: qa.passed,
          pass_mark: quiz?.pass_mark || 70,
          answers: qa.answers,
          created_at: qa.created_at,
          questions_with_answers: questionsWithOptions // Include the actual questions
        };
      });

      // Get ALL requirements for this module and match with responses
      const moduleRequirements = allRequirements?.filter(
        req => req.module_id === module.id
      ) || [];
      
      // Process onsite requirements
      const onsiteResponses = moduleRequirements.map(req => {
        const response = responseMap.get(req.id);
        
        return {
          requirement_id: req.id,
          requirement_label: req.label || "Requirement",
          field_type: req.field_type,
          required: req.required,
          has_response: !!response,
          response_text: response?.response_value || null,
          response_date: response?.created_at || null,
          trainer_name: response?.trainer_id ? trainerProfilesMap.get(response.trainer_id) || null : null
        };
      });
      
      // Process equipment form requirements SEPARATELY
      const equipmentFormResponses = [];
      
      // Check if this module has equipment assessment enabled (for onsite assessment modules)
      if (module.include_equipment_assessment && equipmentTemplates) {
        equipmentTemplates.forEach(equipment => {
          const response = equipmentResponseMap.get(equipment.id);
          equipmentFormResponses.push({
            requirement_id: equipment.id,
            requirement_label: equipment.equipment_name || "Equipment",
            description: equipment.description || null,
            field_type: "checkbox",
            required: equipment.required || false,
            has_response: !!response,
            response_text: response?.response_text || null,
            response_date: response?.created_at || null,
            trainer_name: null
          });
        });
      }
      
      // Also check for equipment form blocks (for digital training modules)
      const moduleEquipmentBlocks = equipmentBlocks?.filter(
        block => block.module_id === module.id
      ) || [];
      
      moduleEquipmentBlocks.forEach(block => {
        if (block.data?.equipment_templates && Array.isArray(block.data.equipment_templates)) {
          block.data.equipment_templates.forEach(equipment => {
            const response = equipmentResponseMap.get(equipment.id);
            // Avoid duplicates if already added from equipment_templates
            if (!equipmentFormResponses.find(r => r.requirement_id === equipment.id)) {
              equipmentFormResponses.push({
                requirement_id: equipment.id,
                requirement_label: equipment.equipment_name || equipment.label || "Equipment",
                description: equipment.description || null,
                field_type: "text",
                required: equipment.required || false,
                has_response: !!response,
                response_text: response?.response_text || null,
                response_date: response?.created_at || null,
                trainer_name: null
              });
            }
          });
        }
      });
      
      // Process form_instances/form_items structure (new format) - show ALL questions
      const formInstanceResponses = [];
      const moduleFormItems = formItemsByModule.get(module.id) || [];
      
      moduleFormItems.forEach(item => {
        const responseKey = `${module.id}_${item.stable_id}`;
        const response = formResponseMap.get(responseKey);
        
        formInstanceResponses.push({
          requirement_id: item.stable_id,
          requirement_label: item.equipment_name || item.description || "Form Question",
          field_type: "text",
          required: item.required || false,
          has_response: !!response,
          response_text: response?.response_text || null,
          response_date: response?.submitted_at || response?.created_at || null,
          trainer_name: null
        });
      });
      
      // Combine NON-equipment responses (onsite + form instances)
      const moduleOnsiteResponses = [...onsiteResponses, ...formInstanceResponses];

      // Get documents for this module
      const moduleDocuments = documents?.filter(
        d => d.module_id === module.id
      ).map(d => ({
        document_title: d.title || "Untitled Document",
        uploaded_at: d.created_at,
        file_path: d.file_path || null
      }));

      return {
        module_id: module.id,
        module_type: module.type,
        module_title: module.title || `Module ${module.order_index + 1}`,
        completed: isCompleted,
        quiz_attempts: moduleQuizAttempts,
        quiz_info: quizInfo,
        onsite_responses: moduleOnsiteResponses,
        equipment_requirements: equipmentFormResponses, // Return equipment separately
        documents: moduleDocuments,
        include_equipment_assessment: module.include_equipment_assessment || false,
        has_onsite_requirements: moduleOnsiteResponses.length > 0
      };
    });

    return NextResponse.json({
      course_id: courseId,
      assignment_status:
        pinnedAssignment.assignment_status ?? assignment?.assignment_status,
      completed_at: pinnedAssignment.completed_at ?? assignment?.completed_at,
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