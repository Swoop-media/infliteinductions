import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { calculateAuthorizationExpiry } from "@/lib/utils/calculateAuthorizationExpiry";

export async function GET(request: NextRequest) {
  const userName = request.nextUrl.searchParams.get("user") || "Vitaljich";
  const adminClient = supabaseAdmin();

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, full_name")
    .ilike("full_name", `%${userName}%`)
    .limit(5);

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ error: "No users found", userName });
  }

  const userId = profiles[0].id;
  const userFullName = profiles[0].full_name;

  const { data: authAssignments } = await adminClient
    .from("authorisation_assignments")
    .select(`
      id,
      authorisation_id,
      completed_at,
      assignment_status,
      authorisations (id, title, valid_for_days)
    `)
    .eq("user_id", userId)
    .eq("assignment_status", "completed");

  const results: any[] = [];

  for (const assignment of (authAssignments || [])) {
    const auth = assignment.authorisations as any;
    const authTitle = auth?.title;
    const validForDays = auth?.valid_for_days;
    const completedAt = new Date(assignment.completed_at);

    const { data: authCourses } = await adminClient
      .from("authorisation_courses")
      .select("course_id")
      .eq("authorisation_id", assignment.authorisation_id);

    const courseIds = (authCourses || []).map((ac: any) => ac.course_id);

    let documents: any[] = [];
    if (courseIds.length > 0) {
      const { data: docs, error: docsError } = await adminClient
        .from("learner_documents")
        .select("id, user_id, course_id, expires_on")
        .eq("user_id", userId)
        .in("course_id", courseIds)
        .not("expires_on", "is", null);
      
      if (docsError) {
        results.push({
          authTitle,
          error: "Error fetching documents",
          docsError
        });
        continue;
      }
      documents = docs || [];
    }

    const { data: courses } = await adminClient
      .from("courses")
      .select("id, title, valid_for_months")
      .in("id", courseIds.length > 0 ? courseIds : ['none']);

    const courseMap = new Map((courses || []).map((c: any) => [c.id, c]));

    let courseAssignments: any[] = [];
    if (courseIds.length > 0) {
      const { data: ca } = await adminClient
        .from("course_assignments")
        .select("course_id, completed_at")
        .eq("user_id", userId)
        .in("course_id", courseIds)
        .eq("role", "trainee")
        .not("completed_at", "is", null);
      courseAssignments = ca || [];
    }

    const userCourses = courseAssignments
      .map((ca: any) => {
        const course = courseMap.get(ca.course_id);
        return {
          valid_for_months: course?.valid_for_months,
          completed_at: ca.completed_at
        };
      })
      .filter((c: any) => c.valid_for_months);

    const expiryDate = calculateAuthorizationExpiry(
      completedAt,
      validForDays,
      documents.map(d => ({ expires_on: d.expires_on })),
      userCourses
    );

    const authExpiryDate = validForDays 
      ? new Date(completedAt.getTime() + validForDays * 24 * 60 * 60 * 1000) 
      : null;

    results.push({
      authTitle,
      completedAt: completedAt.toISOString(),
      validForDays,
      authExpiryDate: authExpiryDate?.toISOString(),
      courseIds,
      documentsFound: documents.length,
      documents: documents.map(d => ({
        courseId: d.course_id,
        courseTitle: courseMap.get(d.course_id)?.title,
        expiresOn: d.expires_on
      })),
      userCourses,
      calculatedExpiryDate: expiryDate?.toISOString(),
      expectedExpirySource: expiryDate ? (
        documents.some(d => new Date(d.expires_on).getTime() === expiryDate.getTime()) 
          ? "Document expiry" 
          : "Authorization validity"
      ) : "No expiry"
    });
  }

  return NextResponse.json({
    userName: userFullName,
    userId,
    authorizations: results
  });
}
