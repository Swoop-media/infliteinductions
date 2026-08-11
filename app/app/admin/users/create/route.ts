// @ts-nocheck
// @ts-nocheck
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";

async function makeURL(path: string): Promise<URL> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) return NextResponse.redirect(await makeURL("/app/home"));

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

  const back = await makeURL("/app/admin/users/new");

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

  // Guard: never assign learners to unpublished (draft/archived) courses —
  // draft-course content is hidden from learners and surfaces as broken quizzes.
  // Covers directly selected courses AND courses linked to selected authorisations.
  // Checked before creating the auth user so rejection leaves no partial account.
  {
    const allCourseIds = new Set(course_ids);
    if (authorization_ids.length > 0) {
      const { data: authLinks, error: linkError } = await supabaseService
        .from("authorisation_courses")
        .select("course_id")
        .in("authorisation_id", authorization_ids);
      if (linkError) {
        console.error("Authorisation course lookup error:", linkError);
        back.searchParams.set("error", "Could not verify the courses required by the selected authorisations. Please try again.");
        return NextResponse.redirect(back);
      }
      for (const link of authLinks || []) allCourseIds.add(link.course_id);
    }
    const idsToCheck = Array.from(allCourseIds);
    if (idsToCheck.length > 0) {
      const { data: selectedCourses, error: statusError } = await supabaseService
        .from("courses")
        .select("id, title, status")
        .in("id", idsToCheck);
      if (statusError || !selectedCourses || selectedCourses.length !== idsToCheck.length) {
        console.error("Course status check error:", statusError);
        back.searchParams.set("error", "Could not verify the status of all selected courses. Please refresh and try again.");
        return NextResponse.redirect(back);
      }
      const unpublished = selectedCourses.filter(c => c.status !== "published");
      if (unpublished.length > 0) {
        const names = unpublished.map(c => `"${c.title}" (${c.status})`).join(", ");
        back.searchParams.set(
          "error",
          `Cannot assign unpublished courses: ${names}. Publish the course(s) first, then assign them (directly or via an authorisation).`
        );
        return NextResponse.redirect(back);
      }
    }
  }

  try {
    // Create user in auth.users first using admin client
    const { data: authUser, error: authError } = await supabaseService.auth.admin.createUser({
      email: email,
      email_confirm: true, // Skip email verification
      user_metadata: {
        full_name: full_name,
        created_via_admin: true
      }
    });

    if (authError) {
      console.error("Auth user creation error:", authError);
      back.searchParams.set("error", `Failed to create user account: ${authError.message}`);
      return NextResponse.redirect(back);
    }

    if (!authUser?.user?.id) {
      console.error("Auth user creation succeeded but no user ID returned");
      back.searchParams.set("error", "Failed to create user account - no ID returned");
      return NextResponse.redirect(back);
    }

    const userId = authUser.user.id;
    console.log("Created auth user with ID:", userId);

    // Small delay to ensure auth user is fully committed to database
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if profile already exists (might be created automatically)
    const { data: existingProfile } = await supabaseService
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    let profile;
    if (existingProfile) {
      // Profile already exists, update it with our data
      const { data: updatedProfile, error: updateError } = await supabaseService
        .from("profiles")
        .update({
          email: email,
          full_name: full_name,
          department: department || null,
          job_description: job_description || null,
          created_via_admin: true,
          awaiting_first_login: true
        })
        .eq("id", userId)
        .select()
        .single();

      if (updateError) {
        console.error("Profile update error:", updateError);
        // If profile update fails, clean up the auth user
        try {
          await supabaseService.auth.admin.deleteUser(userId);
          console.log("Cleaned up auth user after profile update failure");
        } catch (cleanupError) {
          console.error("Failed to cleanup auth user:", cleanupError);
        }
        back.searchParams.set("error", `Failed to update user profile: ${updateError.message}`);
        return NextResponse.redirect(back);
      }
      profile = updatedProfile;
    } else {
      // Create profile record
      const { data: newProfile, error: profileError } = await supabaseService
        .from("profiles")
        .insert({
          id: userId,
          email: email,
          full_name: full_name,
          department: department || null,
          job_description: job_description || null,
          created_via_admin: true,
          awaiting_first_login: true
        })
        .select()
        .single();

      if (profileError) {
        console.error("Profile creation error:", profileError);
        // Check if it's a duplicate key error - if so, try to update instead
        if (profileError.message.includes("duplicate")) {
          const { data: retryProfile, error: retryError } = await supabaseService
            .from("profiles")
            .update({
              email: email,
              full_name: full_name,
              department: department || null,
              job_description: job_description || null,
              created_via_admin: true,
              awaiting_first_login: true
            })
            .eq("id", userId)
            .select()
            .single();

          if (retryError) {
            console.error("Profile update retry error:", retryError);
            try {
              await supabaseService.auth.admin.deleteUser(userId);
              console.log("Cleaned up auth user after profile creation failure");
            } catch (cleanupError) {
              console.error("Failed to cleanup auth user:", cleanupError);
            }
            back.searchParams.set("error", `Failed to create user profile: ${retryError.message}`);
            return NextResponse.redirect(back);
          }
          profile = retryProfile;
        } else {
          // If it's not a duplicate error, clean up and fail
          try {
            await supabaseService.auth.admin.deleteUser(userId);
            console.log("Cleaned up auth user after profile creation failure");
          } catch (cleanupError) {
            console.error("Failed to cleanup auth user:", cleanupError);
          }
          back.searchParams.set("error", `Failed to create user profile: ${profileError.message}`);
          return NextResponse.redirect(back);
        }
      } else {
        profile = newProfile;
      }
    }

    console.log("Created profile for user:", userId);

    // Get current admin user for assignment tracking
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.id) {
      console.error("Admin user lookup failed:", { user: user ? 'exists but no id' : 'null' });
      back.searchParams.set("error", "Unable to identify admin user");
      return NextResponse.redirect(back);
    }

    // Assign courses if selected
    if (course_ids.length > 0) {
      console.log("Creating course assignments for user:", userId, "by admin:", user.id);
      const courseAssignments = course_ids.map(course_id => ({
        user_id: userId,
        course_id: course_id,
        role: "trainee" as const,
        created_by: user.id,
        assignment_status: "assigned" as const
      }));

      const { error: courseError } = await supabaseService
        .from("course_assignments")
        .insert(courseAssignments);

      if (courseError) {
        console.error("Course assignment error:", courseError);
        // Don't fail the entire operation, just log the error
      } else {
        console.log("Successfully created", courseAssignments.length, "course assignments");
      }
    }

    // Assign authorizations if selected
    if (authorization_ids.length > 0) {
      const authAssignments = authorization_ids.map(auth_id => ({
        user_id: userId,
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

    const success = await makeURL("/app/admin/users/new");
    success.searchParams.set("ok", "user_created");
    return NextResponse.redirect(success);

  } catch (error) {
    console.error("User creation error:", error);
    const errorBack = await makeURL("/app/admin/users/new");
    errorBack.searchParams.set("error", "Failed to create user");
    return NextResponse.redirect(errorBack);
  }
}