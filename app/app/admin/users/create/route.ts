import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

function makeURL(path: string): URL {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) return NextResponse.redirect(makeURL("/app/home"));

  const supabase = await createSupabaseServer();
  const supabaseService = supabaseAdmin();
  const form = await req.formData();

  const email = String(form.get("email") || "").trim().toLowerCase();
  const full_name = String(form.get("full_name") || "").trim();
  const department = String(form.get("department") || "").trim();
  const job_description = String(form.get("job_description") || "").trim();

  // Get selected course and authorization IDs
  const course_ids = form.getAll("course_ids").map(id => String(id));
  const authorization_ids = form.getAll("authorization_ids").map(id => String(id));

  const back = makeURL("/app/admin/users/new");

  if (!email || !full_name) {
    back.searchParams.set("error", "Email and full name are required");
    return NextResponse.redirect(back);
  }

  // Check if user already exists by email
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    back.searchParams.set("error", "User with this email already exists");
    return NextResponse.redirect(back);
  }

  try {
    // Create a placeholder user entry in auth.users using admin client
    // We'll use a temporary UUID that will be replaced when they actually sign in
    const tempUserId = crypto.randomUUID();

    // Create profile record with the email for future linking
    const { data: profile, error: profileError } = await supabaseService
      .from("profiles")
      .insert({
        id: tempUserId,
        email: email,
        full_name: full_name,
        department: department || null,
        job_description: job_description || null,
        created_via_admin: true, // Flag to track admin-created users
        awaiting_first_login: true
      })
      .select()
      .single();

    if (profileError) {
      console.error("Profile creation error:", profileError);
      back.searchParams.set("error", "Failed to create user profile");
      return NextResponse.redirect(back);
    }

    // Get current admin user for assignment tracking
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      back.searchParams.set("error", "Unable to identify admin user");
      return NextResponse.redirect(back);
    }

    // Assign courses if selected
    if (course_ids.length > 0) {
      const courseAssignments = course_ids.map(course_id => ({
        user_id: tempUserId,
        course_id: course_id,
        role: "trainee" as const,
        assigned_by: user.id,
        assignment_status: "assigned" as const
      }));

      const { error: courseError } = await supabaseService
        .from("course_assignments")
        .insert(courseAssignments);

      if (courseError) {
        console.error("Course assignment error:", courseError);
        // Don't fail the entire operation, just log the error
      }
    }

    // Assign authorizations if selected
    if (authorization_ids.length > 0) {
      const authAssignments = authorization_ids.map(auth_id => ({
        user_id: tempUserId,
        authorisation_id: auth_id,
        assigned_by: user.id,
        assignment_status: "assigned" as const
      }));

      const { error: authError } = await supabaseService
        .from("authorisation_assignments")
        .insert(authAssignments);

      if (authError) {
        console.error("Authorization assignment error:", authError);
        // Don't fail the entire operation, just log the error
      }
    }

    const success = makeURL("/app/admin/users/new");
    success.searchParams.set("ok", "user_created");
    return NextResponse.redirect(success);

  } catch (error) {
    console.error("User creation error:", error);
    back.searchParams.set("error", "Failed to create user");
    return NextResponse.redirect(back);
  }
}