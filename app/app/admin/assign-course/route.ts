
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

function makeURL(path: string): URL {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  const isCreator = await hasRole("Course creators");
  const isManager = await hasRole("Senior management");
  
  if (!isAdmin && !isCreator && !isManager) {
    return NextResponse.redirect(makeURL("/app/home"));
  }

  const supabase = await createSupabaseServer();
  const form = await req.formData();
  const user_id = String(form.get("user_id") || "").trim();
  const course_id = String(form.get("course_id") || "").trim();

  const to = makeURL("/app/admin?tab=users");
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
    const supabaseService = await import("@/lib/supabase/service").then(m => m.createSupabaseService());
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

  // Assign course (create enrolment with approved status and proper timestamps)
  const now = new Date().toISOString();
  
  // Use the same table as the enrol route: course_enrolments
  const TABLE_NAME = "course_enrolments";
  
  // First, check if enrolment already exists
  const { data: existingEnrolment } = await supabase
    .from(TABLE_NAME)
    .select("id, status, user_id, course_id")
    .eq("user_id", user_id)
    .eq("course_id", course_id)
    .maybeSingle();

  console.log("Existing enrolment check:", { 
    table: TABLE_NAME,
    user_id, 
    course_id, 
    existingEnrolment,
    hasExisting: !!existingEnrolment 
  });

  const { data: enrolmentData, error } = await supabase
    .from(TABLE_NAME)
    .upsert(
      { 
        user_id, 
        course_id, 
        status: "approved", 
        requested_at: now
      },
      { onConflict: "user_id,course_id", ignoreDuplicates: false }
    )
    .select("id, status, user_id, course_id");

  console.log("Enrolment creation result:", { 
    table: TABLE_NAME,
    enrolmentData, 
    error: error?.message || null 
  });

  // Verify the enrolment was created/updated
  if (!error) {
    // Check with regular client
    const { data: verifyEnrolment, error: verifyError } = await supabase
      .from(TABLE_NAME)
      .select("id, status, user_id, course_id, created_at")
      .eq("user_id", user_id)
      .eq("course_id", course_id)
      .maybeSingle();

    console.log("Verification query result (regular client):", { 
      table: TABLE_NAME,
      verifyEnrolment,
      verifyError: verifyError?.message || null
    });

    // Also check with service role client to see if RLS is blocking
    try {
      const supabaseService = await import("@/lib/supabase/service").then(m => m.createSupabaseService());
      const { data: serviceVerify, error: serviceVerifyError } = await supabaseService
        .from(TABLE_NAME)
        .select("id, status, user_id, course_id, created_at")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .maybeSingle();

      console.log("Verification query result (service client):", { 
        table: TABLE_NAME,
        serviceVerify,
        serviceVerifyError: serviceVerifyError?.message || null
      });
    } catch (serviceErr) {
      console.log("Could not verify with service client:", serviceErr);
    }
  }

  console.log("=== ASSIGN COURSE DEBUG END ===");

  // Also ensure the course assignment exists for the trainee role
  if (!error) {
    const { data: assignmentData, error: assignmentError } = await supabase
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
      .select("id");

    console.log("Assignment creation result:", { assignmentData, assignmentError });

    if (assignmentError && (assignmentError as any).code !== "23505") {
      console.warn("Course assignment creation warning:", assignmentError);
    }
  }

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
