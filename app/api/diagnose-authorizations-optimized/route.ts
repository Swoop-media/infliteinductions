// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check if user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has admin role using RPC function
    const { data: hasAdminRole, error: roleError } = await supabase.rpc("has_role", {
      uid: user.id,
      role_name: "Admin"
    });
    
    // Also check for Senior Management if not admin
    let hasSeniorRole = false;
    if (!hasAdminRole) {
      const { data: seniorCheck } = await supabase.rpc("has_role", {
        uid: user.id,
        role_name: "Senior Management"
      });
      hasSeniorRole = !!seniorCheck;
    }

    if (!hasAdminRole && !hasSeniorRole) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Parse request filters
    const body = await request.json();
    const {
      authorizationIds = [],
      userIds = [],
      searchTerm = "",
      excludeCompleted = true,
      excludeApproved = true,
      statusFilter = [],
      page = 1,
      pageSize = 50,
      dateFrom = null,
      dateTo = null
    } = body;

    // Build the base query with all necessary joins
    let query = supabase
      .from("authorisation_assignments")
      .select(`
        id,
        user_id,
        authorisation_id,
        assignment_status,
        completed_at,
        approved_at,
        role,
        profiles!authorisation_assignments_user_id_fkey!inner(
          full_name,
          email
        ),
        authorisations!inner(
          title
        )
      `, { count: 'exact' })
      .eq("role", "trainee");

    // Apply filters
    if (excludeCompleted) {
      query = query.neq("assignment_status", "completed");
    }
    
    if (excludeApproved) {
      query = query.neq("assignment_status", "approved");
    }

    // Only check assignments not already in pending_approval (unless explicitly included)
    if (!statusFilter.includes("pending_approval")) {
      query = query.neq("assignment_status", "pending_approval");
    }

    if (authorizationIds.length > 0) {
      query = query.in("authorisation_id", authorizationIds);
    }

    if (userIds.length > 0) {
      query = query.in("user_id", userIds);
    }

    if (statusFilter.length > 0) {
      query = query.in("assignment_status", statusFilter);
    }

    if (searchTerm) {
      query = query.or(`profiles!authorisation_assignments_user_id_fkey.full_name.ilike.%${searchTerm}%,profiles!authorisation_assignments_user_id_fkey.email.ilike.%${searchTerm}%,authorisations.title.ilike.%${searchTerm}%`);
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: assignments, error: assignError, count } = await query;

    if (assignError) {
      console.error("Error fetching assignments:", assignError);
      return NextResponse.json({ error: "Failed to fetch authorization assignments" }, { status: 500 });
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({
        results: [],
        totalCount: 0,
        page,
        pageSize,
        message: "No authorization assignments found matching criteria"
      });
    }

    // Batch fetch all course data for all authorizations at once
    const authIds = [...new Set(assignments.map(a => a.authorisation_id))];
    const userIdsSet = [...new Set(assignments.map(a => a.user_id))];

    // Get all courses for all relevant authorizations in one query
    const { data: allAuthCourses } = await supabase
      .from("authorisation_courses")
      .select(`
        authorisation_id,
        course_id,
        courses!inner(
          id,
          title
        )
      `)
      .in("authorisation_id", authIds);

    // Create a map of authorization to courses
    const authCoursesMap = new Map();
    allAuthCourses?.forEach(ac => {
      if (!authCoursesMap.has(ac.authorisation_id)) {
        authCoursesMap.set(ac.authorisation_id, []);
      }
      authCoursesMap.get(ac.authorisation_id).push({
        course_id: ac.course_id,
        title: ac.courses.title
      });
    });

    // Get all course assignments for all users at once
    const allCourseIds = [...new Set(allAuthCourses?.map(ac => ac.course_id) || [])];
    
    const { data: allCourseAssignments } = await supabase
      .from("course_assignments")
      .select(`
        user_id,
        course_id,
        assignment_status,
        completed_at
      `)
      .eq("role", "trainee")
      .in("user_id", userIdsSet)
      .in("course_id", allCourseIds);

    // Create a map of user -> course -> status
    const userCourseStatusMap = new Map();
    allCourseAssignments?.forEach(ca => {
      const userKey = ca.user_id;
      if (!userCourseStatusMap.has(userKey)) {
        userCourseStatusMap.set(userKey, new Map());
      }
      userCourseStatusMap.get(userKey).set(ca.course_id, {
        status: ca.assignment_status,
        completedAt: ca.completed_at
      });
    });

    // Process results
    const diagnosticResults = assignments.map(assignment => {
      const authCourses = authCoursesMap.get(assignment.authorisation_id) || [];
      const userCourseMap = userCourseStatusMap.get(assignment.user_id) || new Map();

      if (authCourses.length === 0) {
        return {
          id: assignment.id,
          user: assignment.profiles?.full_name || assignment.user_id,
          email: assignment.profiles?.email,
          userId: assignment.user_id,
          authorization: assignment.authorisations?.title || assignment.authorisation_id,
          authId: assignment.authorisation_id,
          currentStatus: assignment.assignment_status,
          issue: "No courses linked to authorization",
          shouldBePending: false,
          needsFix: false,
          completedAt: assignment.completed_at,
          approvedAt: assignment.approved_at,
          progress: "0/0",
          allCompleted: false
        };
      }

      // Check completion status for each course
      const courseStatuses = authCourses.map(course => {
        const courseStatus = userCourseMap.get(course.course_id);
        return {
          courseTitle: course.title,
          status: courseStatus?.status || "not_assigned",
          completed: courseStatus?.status === "completed"
        };
      });

      const totalCourses = authCourses.length;
      const completedCourses = courseStatuses.filter(cs => cs.completed).length;
      const allCompleted = completedCourses === totalCourses;

      // Determine what the status should be
      let expectedStatus = "assigned";
      if (allCompleted) {
        expectedStatus = "pending_approval";
      } else if (completedCourses > 0) {
        expectedStatus = "in_progress";
      }

      const needsFix = assignment.assignment_status !== expectedStatus && 
                       assignment.assignment_status !== "completed" &&
                       assignment.assignment_status !== "approved";

      return {
        id: assignment.id,
        user: assignment.profiles?.full_name || assignment.user_id,
        email: assignment.profiles?.email,
        userId: assignment.user_id,
        authorization: assignment.authorisations?.title || assignment.authorisation_id,
        authId: assignment.authorisation_id,
        currentStatus: assignment.assignment_status,
        expectedStatus: expectedStatus,
        progress: `${completedCourses}/${totalCourses}`,
        allCompleted: allCompleted,
        shouldBePending: allCompleted && assignment.assignment_status !== "completed" && assignment.assignment_status !== "approved",
        completedAt: assignment.completed_at,
        approvedAt: assignment.approved_at,
        courses: courseStatuses,
        needsFix: needsFix
      };
    });

    // Count issues
    const needsPendingApproval = diagnosticResults.filter(r => r.shouldBePending).length;
    const needsStatusUpdate = diagnosticResults.filter(r => r.needsFix).length;

    return NextResponse.json({
      results: diagnosticResults,
      totalCount: count,
      page,
      pageSize,
      summary: {
        total: diagnosticResults.length,
        needsPendingApproval,
        needsStatusUpdate,
        noIssues: diagnosticResults.filter(r => !r.needsFix && !r.shouldBePending).length
      }
    });

  } catch (error: any) {
    console.error("Diagnosis error:", error);
    return NextResponse.json(
      { error: error.message || "An error occurred during diagnosis" },
      { status: 500 }
    );
  }
}