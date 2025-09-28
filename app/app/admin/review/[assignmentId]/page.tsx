// @ts-nocheck
// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import DocumentSummary from "./DocumentSummary";
import ExpandableCourseDetails from "./ExpandableCourseDetails";

type Props = {
  params: Promise<{ assignmentId: string }>;
};

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
      completed_at,
      authorisations!inner(
        id,
        title,
        description
      )
    `)
    .eq("id", assignmentId)
    .single();

  if (assignError) throw new Error(assignError.message);
  if (!assignment) throw new Error("Assignment not found");

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
        description
      )
    `)
    .eq("authorisation_id", assignment.authorisation_id)
    .order("order_index", { ascending: true });

  if (coursesError) throw new Error(coursesError.message);

  const courseIds = (authCourses || []).map(ac => ac.course_id);

  // Get user's course assignments for these courses
  const { data: courseAssignments, error: courseAssignError } = await supabase
    .from("course_assignments")
    .select("id, course_id, assignment_status, completed_at")
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

  // Fetch quiz attempts for the user
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
        module_id
      )
    `)
    .eq("user_id", assignment.user_id);

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

  // Map course assignments by course_id
  const courseAssignmentMap = new Map(
    (courseAssignments || []).map(ca => [ca.course_id, ca])
  );

  // Process and organize all data by course
  const coursesWithDetails = (authCourses || []).map(ac => {
    const courseData = ac.courses as any;
    const assignment = courseAssignmentMap.get(ac.course_id);
    const courseModules = (modules || []).filter(m => m.course_id === ac.course_id);
    
    // Process module details
    const moduleDetails = courseModules.map(module => {
      // Check if module is completed
      const isCompleted = moduleProgress?.some(
        mp => mp.module_id === module.id && mp.completed_at
      );

      // Get quiz attempts for this module
      const moduleQuizAttempts = quizAttempts?.filter(
        qa => (qa.quizzes as any)?.module_id === module.id
      ).map(qa => ({
        score_pct: qa.score_pct,
        passed: qa.passed,
        answers: qa.answers,
        created_at: qa.created_at
      }));

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
          
          // Extract the response value based on field type
          if (response.response_value) {
            if (typeof response.response_value === 'string') {
              responseText = response.response_value;
            } else if (typeof response.response_value === 'object') {
              // Handle different field types
              if (req.field_type === 'text' || req.field_type === 'textarea') {
                responseText = (response.response_value as any).value || (response.response_value as any).text || JSON.stringify(response.response_value);
              } else if (req.field_type === 'checkbox') {
                responseText = (response.response_value as any).checked ? 'Yes' : 'No';
              } else if (req.field_type === 'radio' || req.field_type === 'select') {
                responseText = (response.response_value as any).value || JSON.stringify(response.response_value);
              } else {
                responseText = JSON.stringify(response.response_value);
              }
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

      return {
        module_id: module.id,
        module_type: module.type,
        module_title: module.title || `Module ${module.order_index + 1}`,
        completed: isCompleted,
        quiz_attempts: moduleQuizAttempts,
        onsite_responses: moduleOnsiteResponses,
        has_onsite_requirements: moduleOnsiteResponses.length > 0,
        documents: moduleDocuments
      };
    });

    return {
      course_id: ac.course_id,
      course_title: courseData.title,
      course_description: courseData.description,
      assignment: assignment,
      modules: moduleDetails
    };
  });

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
      user_id: doc.user_id
    };
  });

  return {
    assignment,
    profile,
    courses: coursesWithDetails,
    documents: documentsWithContext
  };
}

// This function is intended to handle the approval of an authorisation assignment.
async function approveAssignment(formData: FormData) {
  "use server";
  noStore();

  const assignmentId = formData.get("assignmentId") as string;
  const supabase = await createSupabaseServer();

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
      authorisations (
        title,
        valid_for_days
      )
    `)
    .eq("id", assignmentId)
    .single();

  // Get the approver's name
  const { data: approverProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  // Update the authorisation assignment status to 'completed' and record approval details.
  const { error } = await supabase
    .from("authorisation_assignments")
    .update({ 
      assignment_status: "completed",
      approved_at: new Date().toISOString(),
      approved_by: user.id
    })
    .eq("id", assignmentId);

  if (error) {
    console.error("Error approving assignment:", error);
    redirect(`/app/admin/review/${assignmentId}?banner=approval_failed`);
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
  const { assignment, profile, courses, documents } = await loadAssignmentDetails(resolvedParams.assignmentId);

  const authorisation = assignment.authorisations as any;

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
      </div>

      {/* Document Summary */}
      <DocumentSummary documents={documents} />

      {/* Course Progress with Expandable Details */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Course Completion Details</h2>
        <p className="text-sm text-gray-600 mb-4">
          Click on a course to view detailed module completion information including quiz results and onsite training responses.
        </p>
        <ExpandableCourseDetails courses={courses} />
      </div>

      {/* Actions */}
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Review Actions</h2>
        <form action={approveAssignment} className="flex gap-4">
          <input type="hidden" name="assignmentId" value={resolvedParams.assignmentId} />
          <button className="rounded-md bg-green-600 px-6 py-2 text-sm text-white hover:bg-green-700">
            Approve Authorisation
          </button>
          <button className="rounded-md border px-6 py-2 text-sm hover:bg-gray-50">
            Add Notes
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Note: Review functionality will be implemented in the next phase
        </p>
      </div>
    </div>
  );
}