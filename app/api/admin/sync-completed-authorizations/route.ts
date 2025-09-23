import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRoute } from "@/lib/supabase/server";

// Type definitions for database responses
type Profile = {
  id: string;
  role: string;
  full_name?: string;
  email?: string;
};

type AuthAssignment = {
  id: string;
  user_id: string;
  authorisation_id: string;
  assignment_status: string;
};

type AuthCourse = {
  course_id: string;
};

type Authorization = {
  id: string;
  name: string;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRoute();

    // Check if user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user is an admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single() as { data: Profile | null; error: any };

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: "Forbidden - Admin access required" },
        { status: 403 }
      );
    }

    // Get all authorization assignments that are not completed or pending_approval
    const { data: authAssignments, error: authError } = await supabase
      .from("authorisation_assignments")
      .select("id, user_id, authorisation_id, assignment_status")
      .eq("role", "trainee")
      .not("assignment_status", "in", "(completed,pending_approval)") as { data: AuthAssignment[] | null; error: any };

    if (authError) {
      console.error("Error fetching authorization assignments:", authError);
      return NextResponse.json(
        { error: "Failed to fetch authorization assignments" },
        { status: 500 }
      );
    }

    const updatedAuthorizations: any[] = [];
    const processedUsers = new Set<string>();

    // For each authorization assignment, check if all courses are completed
    for (const authAssignment of authAssignments || []) {
      const { user_id, authorisation_id } = authAssignment;
      const userAuthKey = `${user_id}-${authorisation_id}`;
      
      if (processedUsers.has(userAuthKey)) {
        continue;
      }
      processedUsers.add(userAuthKey);

      // Get all courses for this authorization
      const { data: authCourses } = await supabase
        .from("authorisation_courses")
        .select("course_id")
        .eq("authorisation_id", authorisation_id) as { data: AuthCourse[] | null; error?: any };

      const courseIds = authCourses?.map(ac => ac.course_id) || [];

      if (courseIds.length === 0) {
        continue;
      }

      // Check if all courses are completed by this user
      const { data: completedCourses } = await supabase
        .from("course_assignments")
        .select("course_id")
        .eq("user_id", user_id)
        .eq("role", "trainee")
        .eq("assignment_status", "completed")
        .in("course_id", courseIds);

      const allCompleted = completedCourses?.length === courseIds.length;

      console.log(`User ${user_id}, Authorization ${authorisation_id}:`, {
        totalRequired: courseIds.length,
        totalCompleted: completedCourses?.length || 0,
        allCompleted
      });

      if (allCompleted) {
        // Update the authorization to pending_approval
        const { data: updateData, error: updateError } = await (supabase as any)
          .from("authorisation_assignments")
          .update({
            assignment_status: 'pending_approval',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", authAssignment.id)
          .select();

        if (updateError) {
          console.error(`Error updating authorization ${authorisation_id}:`, updateError);
        } else {
          console.log(`Updated authorization ${authorisation_id} to pending_approval`);
          
          // Get user and authorization details for the response
          const { data: userProfile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", user_id)
            .single() as { data: Profile | null; error?: any };

          const { data: authData } = await supabase
            .from("authorisations")
            .select("name")
            .eq("id", authorisation_id)
            .single() as { data: Authorization | null; error?: any };

          updatedAuthorizations.push({
            user_id,
            user_name: userProfile?.full_name || userProfile?.email || 'Unknown',
            authorization_id: authorisation_id,
            authorization_name: authData?.name || 'Unknown',
            status: 'pending_approval'
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synchronized ${updatedAuthorizations.length} completed authorizations`,
      updated: updatedAuthorizations,
      totalChecked: authAssignments?.length || 0
    });

  } catch (error) {
    console.error("Sync authorization error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}