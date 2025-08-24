
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
  const isCreator = await hasRole("Course creators");
  const isManager = await hasRole("Senior management");
  const isAdmin = await hasRole("Admin");
  
  if (!isCreator && !isManager && !isAdmin) {
    return NextResponse.redirect(makeURL("/app/home"));
  }

  const supabase = await createSupabaseServer();
  const form = await req.formData();
  const user_id = String(form.get("user_id") || "").trim();
  const authorization_id = String(form.get("authorization_id") || "").trim();

  const to = makeURL("/app/creator?tab=authorisations");
  if (!user_id || !authorization_id) {
    to.searchParams.set("error", "Missing user_id or authorization_id");
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

  // Get authorization details
  const { data: authorization } = await supabase
    .from("authorisations")
    .select("id, title")
    .eq("id", authorization_id)
    .maybeSingle();

  if (!authorization) {
    to.searchParams.set("error", "Authorization not found");
    return NextResponse.redirect(to);
  }

  // Assign authorization (this depends on your authorization assignment table structure)
  // Assuming you have a user_authorizations table
  const { error } = await supabase
    .from("user_authorizations")
    .upsert(
      { 
        user_id, 
        authorization_id, 
        assigned_at: new Date().toISOString(),
        assigned_by: user.id 
      },
      { onConflict: "user_id,authorization_id", ignoreDuplicates: true }
    );

  if (error) {
    to.searchParams.set("error", error.message);
    return NextResponse.redirect(to);
  }

  // Send notification to user about authorization assignment
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
      type: "authorization_assigned",
      title: `Authorization Assigned: ${authorization.title}`,
      body: `You have been granted the "${authorization.title}" authorization by ${assignerName}.`,
      data: {
        authorizationTitle: authorization.title,
        authorizationId: authorization.id,
        assignedBy: assignerName,
        assignedById: user.id,
        url: `${siteUrl}/app/creator/authorisations/${authorization.id}`
      }
    });
  } catch (notifyError) {
    console.warn("Failed to send authorization assignment notification:", notifyError);
  }

  to.searchParams.set("ok", "authorization_assigned");
  return NextResponse.redirect(to);
}
