
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import PrintButton from "./PrintButton";

type CompletedCourse = {
  assignment_id: string;
  course_title: string;
  completed_at: string;
  valid_for_days: number;
  due_date: string;
  days_until_expiry: number;
  status: 'current' | 'expiring_soon' | 'expired';
};

type CompletedAuthorization = {
  assignment_id: string;
  authorization_title: string;
  completed_at: string;
  valid_for_years: number | null;
  due_date: string | null;
  days_until_expiry: number | null;
  status: 'current' | 'expiring_soon' | 'expired' | 'no_expiry';
};

async function loadUserCompletedItems(userId: string) {
  const supabase = await createSupabaseServer();

  // Get completed courses with due dates
  const { data: completedCourses } = await supabase
    .from("course_assignments")
    .select(`
      id,
      completed_at,
      courses!course_assignments_course_id_fkey(title, valid_for_days)
    `)
    .eq("user_id", userId)
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  // Fetch authorization assignments - using exact same pattern as MyProfile
  const { data: allAuthAssignments, error: authError } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      authorisation_id,
      assignment_status,
      completed_at,
      authorisations!inner(
        id,
        title,
        status,
        valid_for_days
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (authError) {
    console.error('Authorization assignments error:', authError);
  }

  // For each authorization, fetch its courses and the user's progress (like MyProfile does)
  const authWithCourses = await Promise.all(
    (allAuthAssignments ?? []).map(async (authAssignment) => {
      // Get courses for this authorization
      const { data: authCourses } = await supabase
        .from("authorisation_courses")
        .select(`
          course_id,
          order_index,
          courses!inner(
            id,
            title,
            status
          )
        `)
        .eq("authorisation_id", authAssignment.authorisation_id)
        .order("order_index", { ascending: true });

      // Get user's course assignments for these courses
      const courseIds = (authCourses ?? []).map(ac => ac.course_id);
      const { data: userCourseAssignments } = courseIds.length > 0 ? await supabase
        .from("course_assignments")
        .select("course_id, assignment_status, completed_at")
        .eq("user_id", userId)
        .eq("role", "trainee")
        .in("course_id", courseIds) : { data: [] };

      const courseAssignmentMap = new Map(
        (userCourseAssignments ?? []).map(ca => [ca.course_id, ca])
      );

      return {
        ...authAssignment,
        courses: (authCourses ?? []).map(ac => ({
          ...ac,
          assignment: courseAssignmentMap.get(ac.course_id)
        }))
      };
    })
  );

  // Filter completed authorizations - ensure we're checking the right status
  const completedAuthWithCourses = authWithCourses?.filter(auth => 
    auth.assignment_status === "completed" && auth.completed_at
  ) || [];

  // Process courses
  const processedCourses: CompletedCourse[] = (completedCourses || []).map((course: any) => {
    const completedDate = new Date(course.completed_at);
    const validForDays = course.courses?.valid_for_days || 365;
    const dueDate = new Date(completedDate);
    dueDate.setDate(dueDate.getDate() + validForDays);
    
    const today = new Date();
    const daysUntilExpiry = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    let status: 'current' | 'expiring_soon' | 'expired' = 'current';
    if (daysUntilExpiry < 0) status = 'expired';
    else if (daysUntilExpiry <= 30) status = 'expiring_soon';

    return {
      assignment_id: course.id,
      course_title: course.courses?.title || 'Unknown Course',
      completed_at: course.completed_at,
      valid_for_days: validForDays,
      due_date: dueDate.toISOString(),
      days_until_expiry: daysUntilExpiry,
      status
    };
  });

  // Process authorizations using the MyProfile pattern
  const processedAuthorizations: CompletedAuthorization[] = (completedAuthWithCourses || []).map((auth: any) => {
    const completedDate = new Date(auth.completed_at);
    const validForDays = auth.authorisations?.valid_for_days;

    // If no valid_for_days, treat as no expiry
    if (!validForDays) {
      return {
        assignment_id: auth.id,
        authorization_title: auth.authorisations?.title || 'Unknown Authorization',
        completed_at: auth.completed_at,
        valid_for_years: null,
        due_date: null,
        days_until_expiry: null,
        status: 'no_expiry'
      };
    }

    const dueDate = new Date(completedDate);
    dueDate.setDate(dueDate.getDate() + validForDays);

    const today = new Date();
    const daysUntilExpiry = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let status: 'current' | 'expiring_soon' | 'expired' = 'current';
    if (daysUntilExpiry < 0) status = 'expired';
    else if (daysUntilExpiry <= 90) status = 'expiring_soon'; // 3 months for authorizations

    return {
      assignment_id: auth.id,
      authorization_title: auth.authorisations?.title || 'Unknown Authorization',
      completed_at: auth.completed_at,
      valid_for_years: Math.round(validForDays / 365 * 100) / 100, // Convert days to years for display
      due_date: dueDate.toISOString(),
      days_until_expiry: daysUntilExpiry,
      status
    };
  });

  return { processedCourses, processedAuthorizations };
}

export default async function UserTrainingRecordPDF({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  const resolvedParams = await params;
  
  const supabase = await createSupabaseServer();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description")
    .eq("id", resolvedParams.id)
    .maybeSingle();

  if (!profile) {
    return (
      <div className="p-6">
        <h1>User not found</h1>
      </div>
    );
  }

  const { processedCourses, processedAuthorizations } = await loadUserCompletedItems(resolvedParams.id);

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white min-h-screen print:p-6">
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            body { -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
          }
        `
     }} />
      
      {/* Header */}
      <div className="border-b-2 border-gray-900 pb-6 mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Training Record</h1>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Name:</strong> {profile.full_name || "Not specified"}</p>
            <p><strong>Email:</strong> {profile.email}</p>
          </div>
          <div>
            <p><strong>Department:</strong> {profile.department || "Not specified"}</p>
            <p><strong>Position:</strong> {profile.job_description || "Not specified"}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">Generated on: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
      </div>

      {/* Print Button */}
      <PrintButton />

      {/* Completed Authorizations */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          Completed Authorizations ({processedAuthorizations.length})
        </h2>
        {processedAuthorizations.length === 0 ? (
          <p className="text-gray-500 italic">No completed authorizations found.</p>
        ) : (
          <div className="space-y-3">
            {processedAuthorizations.map((auth) => (
              <div key={auth.assignment_id} className="border border-gray-300 rounded-lg p-4">
                <h3 className="font-semibold text-lg">{auth.authorization_title}</h3>
                <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                  <div>
                    <p><strong>Completed:</strong> {new Date(auth.completed_at).toLocaleDateString()}</p>
                    {auth.due_date && (
                      <p><strong>Expires:</strong> {new Date(auth.due_date).toLocaleDateString()}</p>
                    )}
                  </div>
                  <div>
                    <p><strong>Valid for:</strong> {auth.valid_for_years ? `${auth.valid_for_years} year(s)` : 'No expiry'}</p>
                    <p><strong>Status:</strong> 
                      <span className={`ml-1 px-2 py-1 rounded text-xs ${
                        auth.status === 'current' ? 'bg-green-100 text-green-800' :
                        auth.status === 'expiring_soon' ? 'bg-yellow-100 text-yellow-800' :
                        auth.status === 'expired' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {auth.status === 'current' && auth.days_until_expiry ? `Current (${auth.days_until_expiry} days remaining)` :
                         auth.status === 'expiring_soon' && auth.days_until_expiry ? `Expires in ${auth.days_until_expiry} days` :
                         auth.status === 'expired' && auth.days_until_expiry ? `Expired ${Math.abs(auth.days_until_expiry)} days ago` :
                         'No expiry'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Courses */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4 border-b border-gray-300 pb-2">
          Completed Courses ({processedCourses.length})
        </h2>
        {processedCourses.length === 0 ? (
          <p className="text-gray-500 italic">No completed courses found.</p>
        ) : (
          <div className="space-y-3">
            {processedCourses.map((course) => (
              <div key={course.assignment_id} className="border border-gray-300 rounded-lg p-4">
                <h3 className="font-semibold text-lg">{course.course_title}</h3>
                <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                  <div>
                    <p><strong>Completed:</strong> {new Date(course.completed_at).toLocaleDateString()}</p>
                    <p><strong>Expires:</strong> {new Date(course.due_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p><strong>Valid for:</strong> {course.valid_for_days} days</p>
                    <p><strong>Status:</strong> 
                      <span className={`ml-1 px-2 py-1 rounded text-xs ${
                        course.status === 'current' ? 'bg-green-100 text-green-800' :
                        course.status === 'expiring_soon' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {course.status === 'current' ? `Current (${course.days_until_expiry} days remaining)` :
                         course.status === 'expiring_soon' ? `Expires in ${course.days_until_expiry} days` :
                         `Expired ${Math.abs(course.days_until_expiry)} days ago`}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t-2 border-gray-900 pt-4 mt-8 text-xs text-gray-500">
        <p>This training record was generated from the Learning Management System.</p>
        <p>For verification purposes, contact the training department.</p>
      </div>
    </div>
  );
}
