// @ts-nocheck

// @ts-nocheck

import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import ExpandableTrainingRecord from "./ExpandableTrainingRecord";

type CompletedCourse = {
  assignment_id: string;
  course_id: string;
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
      course_id,
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

  // Filter revoked authorizations
  const revokedAuthWithCourses = authWithCourses?.filter(auth => 
    auth.assignment_status === "revoked" || auth.revoked_at
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
      course_id: course.course_id,
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

  // Process revoked authorizations
  const processedRevokedAuthorizations = (revokedAuthWithCourses || []).map((auth: any) => ({
    assignment_id: auth.id,
    authorization_title: auth.authorisations?.title || 'Unknown Authorization',
    completed_at: auth.completed_at,
    revoked_at: auth.revoked_at,
    revoked_by: auth.revoked_by,
    revoked_reason: auth.revoked_reason || 'Revoked by admin',
    status: 'revoked'
  }));

  return { processedCourses, processedAuthorizations, processedRevokedAuthorizations };
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

  const { processedCourses, processedAuthorizations, processedRevokedAuthorizations } = await loadUserCompletedItems(resolvedParams.id);

  return (
    <ExpandableTrainingRecord 
      profile={profile}
      courses={processedCourses}
      authorizations={processedAuthorizations}
      revokedAuthorizations={processedRevokedAuthorizations}
    />
  );
}
