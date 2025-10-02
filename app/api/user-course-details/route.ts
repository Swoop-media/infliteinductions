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
    
    // Try to get the user from the session
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    
    if (!user) {
      console.log('Course details API - No authenticated user found');
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

    // Get course assignment - don't fail if not found (might be viewing completed course without active assignment)
    const { data: assignment } = await adminClient
      .from("course_assignments")
      .select("id, assignment_status, completed_at")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .maybeSingle();

    console.log('Course details API - Assignment found:', {
      courseId,
      userId,
      assignmentId: assignment?.id,
      status: assignment?.assignment_status
    });

    // Get all modules for the course (including equipment assessment flag)
    const { data: modules, error: modulesError } = await adminClient
      .from("course_modules")
      .select("id, title, type, order_index, include_equipment_assessment")
      .eq("course_id", courseId)
      .order("order_index", { ascending: true });

    console.log('Course details API - Modules query result:', {
      found: modules?.length || 0,
      error: modulesError
    });

    if (!modules || modules.length === 0) {
      console.log('Course details API - No modules found for course:', courseId);
      // Return an empty but valid response structure
      return NextResponse.json({
        course_id: courseId,
        assignment_status: assignment?.assignment_status || 'completed',
        completed_at: assignment?.completed_at || null,
        modules: []
      });
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

    // Get modules with equipment assessment enabled
    const modulesWithEquipment = modules.filter(m => m.include_equipment_assessment);
    
    // Get equipment templates for the course (not module-specific)
    const { data: equipmentTemplates } = await adminClient
      .from("equipment_templates")
      .select(`
        id,
        equipment_name,
        description,
        required,
        category,
        order_index
      `)
      .eq("course_id", courseId)
      .order("order_index", { ascending: true });
    
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
        uploaded_at: d.created_at
      }));

      return {
        module_id: module.id,
        module_type: module.type,
        module_title: module.title || `Module ${module.order_index + 1}`,
        completed: isCompleted,
        quiz_attempts: moduleQuizAttempts,
        onsite_responses: moduleOnsiteResponses,
        equipment_requirements: equipmentFormResponses, // Return equipment separately
        documents: moduleDocuments,
        include_equipment_assessment: module.include_equipment_assessment || false
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