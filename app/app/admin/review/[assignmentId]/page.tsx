// @ts-nocheck
// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import DocumentSummary from "./DocumentSummary";
import DocumentRequirements from "./DocumentRequirements";
import ExpandableCourseDetails from "./ExpandableCourseDetails";
import ExpiryPreview from "./ExpiryPreview";

type Props = {
  params: Promise<{ assignmentId: string }>;
};

// Helper function to map equipment IDs to names
function getEquipmentNameFromId(equipmentId: string): string {
  // Map known equipment IDs to names based on the data provided
  const equipmentMap: Record<string, string> = {
    'a8ae5833-8795-4eaf-88ed-0e86427907da': 'Visual Altimeter',
    'b9be5944-9906-5fbb-99ff-1b5cc3823345': 'Audible Altimeter',
    'c0cf6055-0017-6gcc-00ff-2c6dd4934456': 'Helmet',
    'd1df7166-1128-7add-11ff-3d7ee5045567': 'Jumpsuit',
    'e2ef8277-2239-8bee-22ff-4e8ff6156678': 'Instructor cam glove',
    'f3ff9388-3340-9cff-33ff-5f9006267789': 'Other tandem jump clothing',
    'g4009499-4451-0d00-44ff-607117378890': 'Oxygen cannula'
  };
  
  return equipmentMap[equipmentId] || 'Equipment Item';
}

async function loadAssignmentDetails(assignmentId: string) {
  "use server";
  noStore();

  // Use admin client to get all documents from all users
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = supabaseAdmin();

  // Get the authorisation assignment details
  const { data: assignment, error: assignError } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      assignment_status,
      completed_at
    `)
    .eq("id", assignmentId)
    .single();

  if (assignError) throw new Error(assignError.message);
  if (!assignment) throw new Error("Assignment not found");

  // Get the authorisation details
  const { data: authorisation } = await supabase
    .from("authorisations")
    .select(`
      id,
      title,
      description,
      valid_for_days,
      responsible_person
    `)
    .eq("id", assignment.authorisation_id)
    .single();

  // Get user profile separately to avoid relationship ambiguity
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description")
    .eq("id", assignment.user_id)
    .single();

  if (profileError) throw new Error(profileError.message);

  // Get all courses for this authorisation
  const { data: authCourses, error: coursesError } = await supabase
    .from("authorisation_courses")
    .select(`
      course_id,
      order_index,
      courses!inner(
        id,
        title,
        description,
        valid_for_months
      )
    `)
    .eq("authorisation_id", assignment.authorisation_id)
    .order("order_index", { ascending: true });

  if (coursesError) throw new Error(coursesError.message);

  const courseIds = (authCourses || []).map(ac => ac.course_id);

  // Get user's course assignments for these courses with creator information
  const { data: courseAssignments, error: courseAssignError } = await supabase
    .from("course_assignments")
    .select(`
      id, 
      course_id, 
      assignment_status, 
      completed_at,
      created_by,
      assigned_at
    `)
    .eq("user_id", assignment.user_id)
    .eq("role", "trainee")
    .in("course_id", courseIds);

  if (courseAssignError) throw new Error(courseAssignError.message);

  // Get course assignment IDs for various queries
  const courseAssignmentIds = (courseAssignments || []).map(ca => ca.id);
  
  // Fetch learner documents ONLY for courses in this authorization
  let documentsQuery = supabase
    .from("learner_documents")
    .select("*")
    .eq("user_id", assignment.user_id);
  
  // Filter to only documents from courses in this authorization
  if (courseIds.length > 0) {
    documentsQuery = documentsQuery.in("course_id", courseIds);
  }
  
  const { data: documents } = await documentsQuery.order("created_at", { ascending: false });

  // Fetch all modules for the courses
  const { data: modules } = await supabase
    .from("course_modules")
    .select("id, course_id, title, type, order_index")
    .in("course_id", courseIds)
    .order("order_index", { ascending: true });

  // Fetch module progress for all assignments
  const { data: moduleProgress } = await supabase
    .from("assignment_progress")
    .select("assignment_id, module_id, completed_at")
    .in("assignment_id", courseAssignmentIds);

  // Fetch quiz attempts for the user with quiz details
  const { data: quizAttempts } = await supabase
    .from("quiz_attempts")
    .select(`
      id,
      quiz_id,
      score_pct,
      passed,
      answers,
      created_at,
      quizzes!inner(
        module_id,
        pass_mark
      )
    `)
    .eq("user_id", assignment.user_id);
    
  // Fetch quiz questions and options for the modules
  const moduleIds = modules?.map(m => m.id) || [];
  
  // Build the OR query properly to avoid empty arrays
  let quizQuery = supabase
    .from("quizzes")
    .select(`
      id,
      module_id,
      course_id,
      pass_mark
    `);
  
  const quizConditions = [];
  if (moduleIds.length > 0) {
    quizConditions.push(`module_id.in.(${moduleIds.join(',')})`);
  }
  if (courseIds.length > 0) {
    quizConditions.push(`course_id.in.(${courseIds.join(',')})`);
  }
  
  const { data: quizzes } = quizConditions.length > 0
    ? await quizQuery.or(quizConditions.join(','))
    : { data: [], error: null };
    
  const quizIds = quizzes?.map(q => q.id) || [];
  
  // Fetch quiz questions - they can be linked by quiz_id or module_id
  let quizQuestionsQuery = supabase
    .from("quiz_questions")
    .select(`
      id,
      quiz_id,
      module_id,
      stem,
      prompt,
      explanation,
      points,
      order_index,
      kind,
      type
    `);
  
  // Build OR condition for quiz_id and module_id links only (no course_id in quiz_questions)
  const conditions = [];
  if (quizIds.length > 0) conditions.push(`quiz_id.in.(${quizIds.join(',')})`);
  if (moduleIds.length > 0) conditions.push(`module_id.in.(${moduleIds.join(',')})`);
  
  const { data: quizQuestions } = conditions.length > 0
    ? await quizQuestionsQuery.or(conditions.join(',')).order("order_index", { ascending: true })
    : { data: [], error: null };
    
  // Fetch quiz options
  const questionIds = quizQuestions?.map(q => q.id) || [];
  const { data: quizOptions } = await supabase
    .from("quiz_options")
    .select(`
      id,
      question_id,
      label,
      is_correct,
      order_index
    `)
    .in("question_id", questionIds)
    .order("order_index", { ascending: true });

  // Fetch onsite training and assessment responses with trainer info
  const { data: requirementResponses } = await supabase
    .from("requirement_responses")
    .select(`
      id,
      assignment_id,
      module_id,
      requirement_id,
      response_value,
      created_at,
      trainer_id,
      onsite_requirements!inner(
        label,
        role,
        field_type
      )
    `)
    .in("assignment_id", courseAssignmentIds);
  
  // Also fetch all onsite requirements for modules (to show unfilled requirements)
  const { data: allOnsiteRequirements } = await supabase
    .from("onsite_requirements")
    .select(`
      id,
      module_id,
      label,
      role,
      field_type,
      required,
      order_index
    `)
    .in("module_id", modules?.map(m => m.id) || [])
    .order("order_index", { ascending: true });

  // Fetch trainee equipment responses for all courses
  // Note: Using the actual Supabase table structure with all columns
  const { data: traineeEquipmentResponses } = await supabase
    .from("trainee_equipment_responses")
    .select(`
      id,
      course_id,
      user_id,
      equipment_id,
      response_text,
      name,
      brand,
      model,
      serial,
      color,
      size,
      container_brand,
      container_model,
      container_serial,
      container_size,
      response_date,
      assessor_edited,
      created_at,
      updated_at
    `)
    .eq("user_id", assignment.user_id)
    .in("course_id", courseIds)
    .order("created_at", { ascending: true });

  // Get unique trainer IDs from requirement responses
  const trainerIds = [...new Set(requirementResponses?.map(rr => rr.trainer_id).filter(Boolean) || [])];
  
  // Fetch trainer/assessor profiles
  const trainerProfilesMap = new Map();
  if (trainerIds.length > 0) {
    const { data: trainerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", trainerIds);
    
    trainerProfiles?.forEach(profile => {
      trainerProfilesMap.set(profile.id, profile.full_name);
    });
  }
  
  // Get responsible person details if it exists
  let responsiblePersonDetails = null;
  if (authorisation.responsible_person) {
    const { data: responsiblePerson } = await supabase
      .from("profiles")
      .select("id, full_name, email, department")
      .eq("id", authorisation.responsible_person)
      .single();
    
    if (responsiblePerson) {
      responsiblePersonDetails = responsiblePerson;
    }
  }

  // Map course assignments by course_id
  const courseAssignmentMap = new Map(
    (courseAssignments || []).map(ca => [ca.course_id, ca])
  );

  // Process and organize all data by course
  const coursesWithDetails = (authCourses || []).map(ac => {
    const courseData = ac.courses as any;
    const assignment = courseAssignmentMap.get(ac.course_id);
    const courseModules = (modules || []).filter(m => m.course_id === ac.course_id);
    
    // Get equipment responses for this course (moved outside module loop)
    const courseEquipmentResponses = traineeEquipmentResponses?.filter(
      resp => resp.course_id === ac.course_id
    ) || [];
    
    // Map trainee equipment responses directly (since equipment_templates might be empty)
    const equipmentRequirements = courseEquipmentResponses.map(response => {
      // Build response text from available fields
      let responseText = response.response_text || '';
      if (!responseText && (response.name || response.brand || response.model)) {
        const parts = [];
        if (response.brand) parts.push(response.brand);
        if (response.model) parts.push(response.model);
        if (response.name) parts.push(response.name);
        responseText = parts.join(' ');
      }
      
      return {
        requirement_id: response.equipment_id,
        requirement_label: getEquipmentNameFromId(response.equipment_id), // Helper to map IDs to names
        description: null,
        response_text: responseText,
        response_date: response.response_date || response.created_at || null,
        trainer_name: null, // Equipment responses don't have trainer info
        field_type: 'text',
        required: true,
        has_response: true
      };
    });
    
    // Process module details
    const moduleDetails = courseModules.map(module => {
      // Check if module is completed
      const isCompleted = moduleProgress?.some(
        mp => mp.module_id === module.id && mp.completed_at
      );

      // Find quiz for this module (could be linked by module_id or course_id)
      const moduleQuiz = quizzes?.find(q => 
        q.module_id === module.id || 
        (!q.module_id && q.course_id === ac.course_id)
      );
      
      // Get quiz questions for this module (can be linked by quiz_id or module_id)
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
      
      // Get quiz attempts for this module
      const moduleQuizAttempts = quizAttempts?.filter(
        qa => (qa.quizzes as any)?.module_id === module.id
      ).map(qa => {
        const quiz = qa.quizzes as any;
        const userAnswers = qa.answers || {};
        
        return {
          score_pct: qa.score_pct,
          passed: qa.passed,
          pass_mark: quiz?.pass_mark || 70, // Default to 70% if not set
          answers: qa.answers,
          created_at: qa.created_at,
          questions_with_answers: questionsWithOptions // Include the actual questions
        };
      });

      // Get all requirements for this module
      const moduleRequirements = allOnsiteRequirements?.filter(
        req => req.module_id === module.id
      ) || [];
      
      // Get responses for this module
      const moduleResponses = requirementResponses?.filter(
        rr => rr.module_id === module.id
      ) || [];
      
      // Map requirements with their responses
      const moduleOnsiteResponses = moduleRequirements.map(req => {
        const response = moduleResponses.find(r => r.requirement_id === req.id);
        
        let responseText = '';
        let trainerName = null;
        let responseDate = null;
        
        if (response) {
          trainerName = response.trainer_id ? trainerProfilesMap.get(response.trainer_id) || 'Unknown Trainer' : null;
          responseDate = response.created_at;
          
          // Extract the response value - handle both simple values and objects
          if (response.response_value !== null && response.response_value !== undefined) {
            const value = response.response_value;
            
            if (typeof value === 'string' || typeof value === 'number') {
              // Simple value - most common case
              responseText = String(value);
            } else if (typeof value === 'boolean') {
              responseText = value ? 'Yes' : 'No';
            } else if (typeof value === 'object' && value !== null) {
              // Handle complex objects (legacy format or special cases)
              if ('value' in value) {
                responseText = String(value.value);
              } else if ('text' in value) {
                responseText = String(value.text);
              } else if ('checked' in value) {
                responseText = value.checked ? 'Yes' : 'No';
              } else {
                // Fallback: stringify the object
                responseText = JSON.stringify(value);
              }
            } else {
              responseText = '';
            }
            
            // Special handling for numeric ratings (1-5 scale)
            if (typeof value === 'number' && value >= 1 && value <= 5) {
              responseText = `Rating: ${value}/5`;
            }
          }
        }
        
        return {
          requirement_id: req.id,
          requirement_label: req.label || "Requirement",
          response_text: responseText,
          response_date: responseDate,
          trainer_name: trainerName,
          field_type: req.field_type || 'text',
          required: req.required,
          has_response: !!response
        };
      });

      // Get documents uploaded for this module or course
      const moduleDocuments = documents?.filter(
        d => d.module_id === module.id || (d.course_id === ac.course_id && !d.module_id)
      ).map(d => ({
        document_title: d.title || "Untitled Document",
        uploaded_at: d.created_at
      }));

      // Check if this module should include equipment assessment
      // Only show equipment on modules that are specifically for equipment assessment
      const includeEquipmentAssessment = module.include_equipment_assessment === true || 
                                        (module.title?.toLowerCase().includes('equipment') && 
                                         module.title?.toLowerCase().includes('assessment'));
      
      return {
        module_id: module.id,
        module_type: module.type,
        module_title: module.title || `Module ${module.order_index + 1}`,
        completed: isCompleted,
        quiz_attempts: moduleQuizAttempts,
        quiz_info: moduleQuiz ? {
          quiz_id: moduleQuiz.id,
          pass_mark: moduleQuiz.pass_mark || 70,
          questions: questionsWithOptions
        } : undefined,
        onsite_responses: moduleOnsiteResponses,
        equipment_requirements: includeEquipmentAssessment && equipmentRequirements.length > 0 ? equipmentRequirements : undefined,
        has_onsite_requirements: moduleOnsiteResponses.length > 0,
        include_equipment_assessment: includeEquipmentAssessment,
        documents: moduleDocuments
      };
    });

    console.log('Course assignment data:', {
      course_id: ac.course_id,
      assignment_id: assignment?.id,
      assignment_user_id: assignment?.user_id,
      equipment_count: equipmentRequirements.length,
      equipment_responses: courseEquipmentResponses.length
    });
    
    return {
      course_id: ac.course_id,
      course_title: courseData.title,
      course_description: courseData.description,
      valid_for_months: courseData.valid_for_months,
      assignment: assignment,
      modules: moduleDetails
    };
  });

  // Fetch document requirements from module_content_blocks
  let documentRequirements = [];
  if (moduleIds.length > 0) {
    const { data: contentBlocks } = await supabase
      .from("module_content_blocks")
      .select("*")
      .in("module_id", moduleIds)
      .eq("kind", "request_document")
      .order("order_index", { ascending: true });
      
    if (contentBlocks) {
      documentRequirements = contentBlocks.map(block => {
        const module = modules?.find(m => m.id === block.module_id);
        const course = authCourses?.find(ac => {
          const courseModules = modules?.filter(m => m.course_id === ac.course_id) || [];
          return courseModules.some(m => m.id === block.module_id);
        });
        
        // Parse the data field to get the label and requirements
        const blockData = block.data || {};
        const label = blockData.label || "Document Upload Required";
        const requireExpiry = blockData.require_expiry || false;
        
        return {
          id: block.id,
          module_id: block.module_id,
          module_title: module?.title || "Unknown Module",
          course_id: course?.course_id || null,
          course_title: (course?.courses as any)?.title || "Unknown Course",
          label: label,
          require_expiry: requireExpiry,
          order_index: block.order_index
        };
      });
    }
  }

  // Process documents for the summary section
  const documentsWithContext = (documents || []).map(doc => {
    const course = authCourses?.find(ac => ac.course_id === doc.course_id);
    const module = modules?.find(m => m.id === doc.module_id);
    
    return {
      id: doc.id,
      title: doc.title || "Untitled Document",
      course_title: doc.course_title || (course?.courses as any)?.title || "General Document",
      module_title: doc.module_title || module?.title || "N/A",
      storage_path: doc.file_path || doc.storage_path,
      expires_on: doc.expires_on,
      created_at: doc.created_at,
      user_id: doc.user_id,
      block_id: doc.block_id || null,
      module_id: doc.module_id || null
    };
  });

  return {
    assignment,
    authorisation,
    profile,
    courses: coursesWithDetails,
    documents: documentsWithContext,
    documentRequirements,
    responsiblePerson: responsiblePersonDetails
  };
}

// This function is intended to handle the approval of an authorisation assignment.
async function approveAssignment(formData: FormData) {
  "use server";
  noStore();

  const assignmentId = formData.get("assignmentId") as string;
  const supabase = await createSupabaseServer();
  const { supabaseAdmin } = await import('@/lib/supabase/admin');
  const supabaseService = supabaseAdmin();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Get the assignment details to know who to notify
  const { data: assignment } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      authorisations (
        title,
        valid_for_days
      )
    `)
    .eq("id", assignmentId)
    .single();

  if (!assignment) {
    redirect(`/app/admin/review/${assignmentId}?banner=not_found`);
  }

  // Get the approver's name
  const { data: approverProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  // Calculate expiry date based on earliest of:
  // 1. Authorization valid_for_days
  // 2. Document expiry dates
  // 3. Course valid_for_months
  
  // Import the calculation utility
  const { calculateAuthorizationExpiry } = await import('@/lib/utils/calculateAuthorizationExpiry');
  
  // Get documents for this user and authorization's courses
  const { data: authCourses } = await supabase
    .from("authorisation_courses")
    .select(`
      course_id,
      courses!inner(
        id,
        valid_for_months
      )
    `)
    .eq("authorisation_id", assignment.authorisation_id);
    
  const courseIds = authCourses?.map(ac => ac.course_id) || [];
  
  // Get documents with expiry dates
  const { data: documents } = await supabase
    .from("learner_documents")
    .select("expires_on")
    .eq("user_id", assignment.user_id)
    .in("course_id", courseIds);
  
  // Calculate the expiry date
  const approvalDate = new Date();
  const authorization = assignment.authorisations as any;
  
  const coursesData = authCourses?.map(ac => ({
    valid_for_months: (ac.courses as any).valid_for_months
  })) || [];
  
  const expiryDate = calculateAuthorizationExpiry(
    approvalDate,
    authorization?.valid_for_days || null,
    documents || [],
    coursesData
  );

  // Update the authorisation assignment status to 'completed' and record approval details.
  // Use admin client to bypass RLS and ensure schema cache is up to date
  // First update without expires_at to avoid schema cache issues
  const { error: updateError } = await supabaseService
    .from("authorisation_assignments")
    .update({ 
      assignment_status: "completed",
      approved_at: approvalDate.toISOString(),
      approved_by: user.id
    })
    .eq("id", assignmentId);
    
  if (updateError) {
    console.error("Error approving assignment:", updateError);
    redirect(`/app/admin/review/${assignmentId}?banner=approval_failed`);
  }
  
  // Then update expires_at separately if we have an expiry date
  if (expiryDate) {
    const { error: expiryError } = await supabaseService
      .from("authorisation_assignments")
      .update({ 
        expires_at: expiryDate.toISOString()
      })
      .eq("id", assignmentId);
      
    if (expiryError) {
      console.error("Warning: Could not set expiry date:", expiryError);
      // Don't fail the whole approval if expiry update fails
    }
  }
  
  // Send notification to the trainee about the approval
  if (assignment && assignment.user_id) {
    try {
      const { notifyUser } = await import("@/lib/notifications/dispatcher");
      const authorization = assignment.authorisations as any;
      
      await notifyUser(
        assignment.user_id,
        "authorization_approved",
        {
          authorizationTitle: authorization?.title || "Authorization",
          approvedBy: approverProfile?.full_name || user.email,
          validFor: authorization?.valid_for_days || null,
          url: "/app/myprofile/authorisations"
        }
      );
      console.log(`✅ Notification sent to trainee ${assignment.user_id} for authorization approval`);
    } catch (notifyError) {
      console.error("Failed to send notification:", notifyError);
      // Don't block the approval process if notification fails
    }
  }

  // Redirect back to the admin dashboard with a success banner
  redirect("/app/admin?tab=pending_authorisations&banner=approval_success");
}

export default async function ReviewAssignmentPage({ params }: Props) {
  // Check if user has Authorization Approver role
  const isApprover = await hasRole("Authorization Approver");
  if (!isApprover) {
    redirect("/app/admin?tab=pending_authorisations&banner=no_access");
  }

  const resolvedParams = await params;
  const { assignment, authorisation, profile, courses, documents, documentRequirements, responsiblePerson } = await loadAssignmentDetails(resolvedParams.assignmentId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review Authorisation</h1>
          <p className="text-sm text-gray-600">
            Review trainee's completed learning for authorisation approval
          </p>
        </div>
        <Link
          href="/app/admin?tab=pending_authorisations"
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        >
          ← Back to Pending Authorisations
        </Link>
      </div>

      {/* Trainee Information */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Trainee Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <p className="mt-1 text-sm text-gray-900">{profile.full_name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-sm text-gray-900">{profile.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Department</label>
            <p className="mt-1 text-sm text-gray-900">{profile.department || "Not specified"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Job Description</label>
            <p className="mt-1 text-sm text-gray-900">{profile.job_description || "Not specified"}</p>
          </div>
        </div>
      </div>

      {/* Authorisation Details */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Authorisation Details</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700">Authorisation</label>
          <p className="mt-1 text-lg font-semibold text-gray-900">{authorisation.title}</p>
          {authorisation.description && (
            <p className="mt-2 text-sm text-gray-600">{authorisation.description}</p>
          )}
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">Completion Date</label>
          <p className="mt-1 text-sm text-gray-900">
            {assignment.completed_at ? new Date(assignment.completed_at).toLocaleDateString() : "Not completed"}
          </p>
        </div>
        
        {/* Responsible Person */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">Responsible Person</label>
          {responsiblePerson ? (
            <div className="mt-1 text-sm text-gray-900">
              <p className="font-medium">{responsiblePerson.full_name || 'Unknown'}</p>
              {responsiblePerson.email && (
                <p className="text-gray-600">{responsiblePerson.email}</p>
              )}
              {responsiblePerson.department && (
                <p className="text-gray-500">Department: {responsiblePerson.department}</p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-500 italic">No responsible person assigned</p>
          )}
        </div>
      </div>

      {/* Document Requirements and Summary */}
      <DocumentRequirements 
        documents={documents} 
        courses={courses} 
        documentRequirements={documentRequirements} 
      />
      
      {/* Original Document Summary */}
      <DocumentSummary documents={documents} />

      {/* Course Progress with Expandable Details */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Course Completion Details</h2>
        <p className="text-sm text-gray-600 mb-4">
          Click on a course to view detailed module completion information including quiz results and onsite training responses.
        </p>
        <ExpandableCourseDetails 
          courses={courses} 
          assignmentId={resolvedParams.assignmentId}
          userId={profile.id}
        />
      </div>

      {/* Authorization Expiry Preview */}
      <ExpiryPreview 
        authValidForDays={authorisation.valid_for_days}
        documents={documents}
        courses={courses}
      />

      {/* Actions */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Review Actions</h2>
        <form action={approveAssignment} className="flex gap-4">
          <input type="hidden" name="assignmentId" value={resolvedParams.assignmentId} />
          <button className="rounded-md bg-green-600 px-6 py-2 text-sm text-white hover:bg-green-700">
            Approve Authorisation
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Note: Review functionality will be implemented in the next phase
        </p>
      </div>
    </div>
  );
}