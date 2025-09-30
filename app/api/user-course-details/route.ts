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
    
    // Check if user has permission to view this data (admin or the user themselves)
    const { data: userRole } = await supabase
      .from("profiles") 
      .select("role")
      .eq("id", user.id)
      .single();
    
    const isAdmin = userRole?.role === 'admin' || userRole?.role === 'trainers_and_assessors';
    const isOwnData = user.id === userId;
    
    if (!isAdmin && !isOwnData) {
      return NextResponse.json({ error: 'Forbidden - No permission to view this data' }, { status: 403 });
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

    // Get ALL requirements for all modules (not just ones with responses)
    const moduleIds = modules.map(m => m.id);
    const { data: allRequirements } = await adminClient
      .from("onsite_requirements")
      .select(`
        id,
        module_id,
        label,
        field_type,
        required,
        role,
        order_index
      `)
      .in("module_id", moduleIds)
      .order("order_index", { ascending: true });

    // Get all requirement responses (including digital forms, onsite training, etc.)
    const { data: requirementResponses } = assignment?.id ? await adminClient
      .from("requirement_responses")
      .select(`
        id,
        module_id,
        requirement_id,
        response_value,
        trainer_id,
        created_at
      `)
      .eq("assignment_id", assignment.id) : { data: [] };

    // Create a map of responses by requirement_id
    const responseMap = new Map();
    requirementResponses?.forEach(response => {
      responseMap.set(response.requirement_id, response);
    });

    // Get equipment form blocks for digital training modules
    const { data: equipmentBlocks } = await adminClient
      .from("module_content_blocks")
      .select(`
        id,
        module_id,
        kind,
        data,
        order_index
      `)
      .eq("kind", "equipment_form")
      .in("module_id", moduleIds);

    // Get equipment form responses (old structure)
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

    // Create a map of equipment responses
    const equipmentResponseMap = new Map();
    equipmentResponses?.forEach(response => {
      equipmentResponseMap.set(response.equipment_id, response);
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
      
      // Process equipment form requirements (for digital training)
      const moduleEquipmentBlocks = equipmentBlocks?.filter(
        block => block.module_id === module.id
      ) || [];
      
      const equipmentFormResponses = [];
      moduleEquipmentBlocks.forEach(block => {
        if (block.data?.equipment_templates && Array.isArray(block.data.equipment_templates)) {
          block.data.equipment_templates.forEach(equipment => {
            const response = equipmentResponseMap.get(equipment.id);
            equipmentFormResponses.push({
              requirement_id: equipment.id,
              requirement_label: equipment.equipment_name || equipment.label || "Equipment",
              field_type: "text",
              required: equipment.required || false,
              has_response: !!response,
              response_text: response?.response_text || null,
              response_date: response?.created_at || null,
              trainer_name: null // Equipment forms are self-completed, not by trainers
            });
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
      
      // Combine all responses (onsite + equipment forms + form instances)
      const moduleOnsiteResponses = [...onsiteResponses, ...equipmentFormResponses, ...formInstanceResponses];

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