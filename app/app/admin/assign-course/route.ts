import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

async function makeURL(path: string): Promise<URL> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  const isManager = await hasRole("Senior management");

  if (!isAdmin && !isManager) {
    return NextResponse.redirect(await makeURL("/app/home"));
  }

  const supabase = await createSupabaseServer();
  const form = await req.formData();
  const user_id = String(form.get("user_id") || "").trim();
  const course_id = String(form.get("course_id") || "").trim();

  const to = await makeURL("/app/admin?tab=users");
  if (!user_id || !course_id) {
    to.searchParams.set("error", "Missing user_id or course_id");
    return NextResponse.redirect(to);
  }

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    to.searchParams.set("error", "Not authenticated");
    return NextResponse.redirect(to);
  }

  // Debug: Comprehensive database state check
  console.log("=== ASSIGN COURSE DEBUG START ===");
  console.log("User attempting to assign:", { admin_user_id: user.id, target_user_id: user_id, course_id });

  // Check what enrolment-related tables exist
  try {
    const { data: tablesCheck } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public")
      .like("table_name", "%enrol%");

    console.log("Available enrolment tables:", tablesCheck);
  } catch (e) {
    console.log("Could not check tables:", e);
  }

  // Check current enrolments for this user/course combination across both possible tables
  try {
    console.log("Checking existing enrolments for user/course...");

    const { data: ceData, error: ceError } = await supabase
      .from("course_enrolments")
      .select("*")
      .eq("user_id", user_id)
      .eq("course_id", course_id);

    const { data: eData, error: eError } = await supabase
      .from("enrolments")
      .select("*")
      .eq("user_id", user_id)
      .eq("course_id", course_id);

    console.log("course_enrolments existing records:", { 
      error: ceError?.message || null, 
      count: ceData?.length || 0,
      data: ceData 
    });

    console.log("enrolments existing records:", { 
      error: eError?.message || null, 
      count: eData?.length || 0,
      data: eData 
    });

    // Also check with service role to see if RLS is the issue
    const { createSupabaseService } = await import("@/lib/supabase/service");
    const supabaseService = await createSupabaseService();
    const { data: serviceData, error: serviceError } = await supabaseService
      .from("course_enrolments")
      .select("*")
      .eq("user_id", user_id)
      .eq("course_id", course_id);

    console.log("course_enrolments via service role:", { 
      error: serviceError?.message || null, 
      count: serviceData?.length || 0,
      data: serviceData 
    });

  } catch (e) {
    console.log("Error checking existing enrolments:", e);
  }

  // Get course details
  const { data: course } = await supabase
    .from("courses")
    .select("id, title")
    .eq("id", course_id)
    .maybeSingle();

  if (!course) {
    to.searchParams.set("error", "Course not found");
    return NextResponse.redirect(to);
  }

  // Use course_assignments approach instead of enrolments
  const now = new Date().toISOString();

  // Clean up any existing enrollment records to start fresh
  const { createSupabaseService } = await import("@/lib/supabase/service");
  const supabaseService = await createSupabaseService();

  // Clean up both enrolment tables
  const { error: cleanupError1 } = await supabaseService
    .from("course_enrolments")
    .delete()
    .eq("user_id", user_id)
    .eq("course_id", course_id);

  const { error: cleanupError2 } = await supabaseService
    .from("enrolments")
    .delete()
    .eq("user_id", user_id)
    .eq("course_id", course_id);

  console.log("Cleanup results:", {
    course_enrolments: cleanupError1?.message || "success",
    legacy_enrolments: cleanupError2?.message || "success"
  });

  // Create course assignment (trainee role = automatically approved access)
  const { data: assignmentData, error } = await supabase
    .from("course_assignments")
    .upsert(
      {
        user_id,
        course_id,
        role: "trainee",
        created_by: user.id
      },
      { onConflict: "course_id,user_id,role", ignoreDuplicates: false }
    )
    .select("id, user_id, course_id, role, created_at");

  console.log("Assignment creation result:", { 
    assignmentData, 
    error: error?.message || null,
    errorCode: (error as any)?.code || null
  });

  // Verify the assignment was created
  if (!error && assignmentData && assignmentData.length > 0) {
    console.log("✅ Course assignment created successfully:", assignmentData[0]);

    // Double-check by querying it back
    const { data: verifyData, error: verifyError } = await supabase
      .from("course_assignments")
      .select("id, user_id, course_id, role")
      .eq("user_id", user_id)
      .eq("course_id", course_id)
      .eq("role", "trainee")
      .single();

    console.log("Assignment verification:", {
      verifyData,
      verifyError: verifyError?.message || null
    });
  } else {
    console.log("❌ Course assignment creation failed or returned no data");
  }

  console.log("=== ASSIGN COURSE DEBUG END ===");

  if (error) {
    to.searchParams.set("error", error.message);
    return NextResponse.redirect(to);
  }

  // Send notification to user about course assignment
  try {
    const { createNotification } = await import("@/app/app/_actions/notifications");

    // Get assigner name
    const { data: assigner } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

    const assignerName = assigner ? `${assigner.first_name} ${assigner.last_name}`.trim() : "Admin";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    await createNotification({
      recipientUserId: user_id,
      type: "course_assigned",
      title: `Course Assigned: ${course.title}`,
      body: `You have been enrolled in "${course.title}" by ${assignerName}. You can start learning now!`,
      sendTeams: true,
      data: {
        courseTitle: course.title,
        courseId: course.id,
        assignedBy: assignerName,
        assignedById: user.id,
        url: `${siteUrl}/app/learn/courses/${course.id}`
      }
    });
  } catch (notifyError) {
    console.warn("Failed to send course assignment notification:", notifyError);
  }

  to.searchParams.set("ok", "course_assigned");
  return NextResponse.redirect(to);
}