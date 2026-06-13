// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ResitNotificationMenu from "./_components/ResitNotificationMenu";
import { toAbsoluteUrl } from "@/lib/utils/url";
import {
  listSafefliteRisks,
  upsertTrainingControl,
  type SafefliteRisk,
} from "@/lib/webhooks/safeflite-control";

/** Types & helpers */
type ModuleType =
  | "digital_training"
  | "digital_assessment_quiz"
  | "onsite_training"
  | "onsite_assessment";

type TabKey =
  | "details"
  | "digital_training"
  | "digital_assessment_quiz"
  | "onsite_training"
  | "onsite_assessment"
  | "assignments";

function tabLabel(t: TabKey) {
  switch (t) {
    case "details": return "Details";
    case "digital_training": return "Digital Training";
    case "digital_assessment_quiz": return "Digital Assessment (Quiz)";
    case "onsite_training": return "Onsite Training";
    case "onsite_assessment": return "Onsite Assessment";
    case "assignments": return "Assignments";
  }
}

function tabKeyFromSearch(spObj: Record<string, string | string[] | undefined>): TabKey {
  const raw =
    typeof spObj.tab === "string"
      ? spObj.tab
      : Array.isArray(spObj.tab)
      ? spObj.tab[0]
      : undefined;
  switch (raw) {
    case "details": return "details";
    case "digital_training": return "digital_training";
    case "digital_assessment_quiz":
    case "quiz": return "digital_assessment_quiz";
    case "onsite_training": return "onsite_training";
    case "onsite_assessment": return "onsite_assessment";
    case "assignments": return "assignments";
    default: return "details";
  }
}

/** Build URL helpers */
function buildCourseUrl(courseId: string, tab?: TabKey, notice?: string) {
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  if (notice) params.set("notice", notice);
  return `/app/creator/courses/${courseId}${params.toString() ? `?${params.toString()}` : ""}`;
}

function fmtUTC(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().replace("T", " ").replace("Z", " UTC");
}

function moduleEditHref(type: ModuleType, id: string) {
  if (type === "onsite_training" || type === "onsite_assessment") {
    return `/app/creator/modules/${id}/onsite`;
  }
  if (type === "digital_assessment_quiz") {
    return `/app/creator/modules/${id}/quiz`;
  }
  return `/app/creator/modules/${id}`;
}

/** Flash banner (reads ?notice=...) */
function noticeMessage(code?: string) {
  switch (code) {
    case "saved": return "Saved.";
    case "status_updated": return "Course status updated.";
    case "module_created": return "Module created.";
    case "module_deleted": return "Module deleted.";
    case "module_renamed": return "Module renamed.";
    case "module_reordered": return "Module order updated.";
    case "assigned": return "Person assigned to course.";
    case "revoked": return "Assignment revoked.";
    case "resit_notifications_sent": return "Resit notifications sent successfully.";
    default: return null;
  }
}

/** Server loaders */
type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  valid_for_days: number | null;
  retake_reminder_days: number | null;
  notification_lead_days: number | null;
  department: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  external_contractors?: boolean;
  contractor_flow_type?: string | null;
  contractor_site_id?: string | null;
  visitor_flow_type?: string | null;
};

type LoadCourseResult = {
  user: any;
  course: CourseRow | null;
  err: string | null;
};

async function loadCourse(courseId: string): Promise<LoadCourseResult> {
  "use server";
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data: course, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .maybeSingle();

  if (error || !course) {
    return { user, course: null, err: error?.message ?? "Course not found" };
  }
  return { user, course: course as CourseRow, err: null };
}

async function loadModules(courseId: string, type?: ModuleType) {
  "use server";
  const supabase = await createSupabaseServer();
  let q = supabase.from("course_modules").select("*").eq("course_id", courseId);
  if (type) q = q.eq("type", type);

  const { data, error } = await q
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Assignments data */
type AssignmentRow = {
  id: string;
  user_id: string;
  course_id: string;
  role: "trainee" | "onsite_trainer" | "onsite_assessor";
  created_at: string | null;
  created_by: string | null;
};

type Profile = { id: string; full_name: string | null; email: string | null };

async function loadAssignments(courseId: string) {
  "use server";
  const supabase = await createSupabaseServer();

  const { data: rows, error } = await supabase
    .from("course_assignments")
    .select("id, user_id, course_id, role, created_at, created_by")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const userIds = Array.from(new Set((rows ?? []).map(r => r.user_id)));
  const profileMap = new Map<string, Profile>();

  if (userIds.length) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    if (pErr) throw new Error(pErr.message);
    (profs ?? []).forEach(p => profileMap.set(p.id, p as Profile));
  }

  return { assignments: (rows ?? []) as AssignmentRow[], profileMap };
}

async function searchProfilesByQuery(q: string | null) {
  "use server";
  if (!q || !q.trim()) return [];
  const supabase = await createSupabaseServer();
  const like = `%${q.trim()}%`;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .order("full_name", { ascending: true })
    .limit(12);
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

/** Actions: every one accepts an optional `next` and redirects with a notice */
async function createModuleAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const courseId = String(formData.get("course_id") || "");
  const type = String(formData.get("type") || "") as ModuleType;
  const next = String(formData.get("next") || "") || buildCourseUrl(courseId, type, "module_created");

  const defaultTitle =
    type === "digital_training" ? "Training Module"
    : type === "digital_assessment_quiz" ? "Digital Quiz"
    : type === "onsite_training" ? "Onsite Training"
    : "Onsite Assessment";

  const title = (String(formData.get("title") || "").trim() || defaultTitle).slice(0, 200);
  if (!courseId || !type) throw new Error("Missing fields");

  // determine next order within this type
  const { data: maxRow, error: maxErr } = await supabase
    .from("course_modules")
    .select("order_index")
    .eq("course_id", courseId)
    .eq("type", type)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw new Error(maxErr.message);
  const nextOrder = (maxRow?.order_index ?? -1) + 1;

  // insert module and RETURN id/course_id
  const { data: inserted, error } = await supabase
    .from("course_modules")
    .insert({ course_id: courseId, type, title, order_index: nextOrder })
    .select("id, course_id")
    .single();
  if (error) throw new Error(error.message);

  // If it's a quiz module, automatically create the linked quiz row with sensible defaults
  if (type === "digital_assessment_quiz" && inserted) {
    try {
      await supabase.from("quizzes").insert({
        course_id: inserted.course_id,
        module_id: inserted.id,   // bind quiz to this module
        pass_mark: 80,
        max_attempts: 3,
        shuffle: true,
      });
    } catch {
      // don't block module creation if quiz row fails for any reason
    }
  }

  revalidatePath(buildCourseUrl(courseId));
  redirect(next);
}

async function moveModuleAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  const type = String(formData.get("type") ?? "") as ModuleType;
  const direction = String(formData.get("direction") ?? "up"); // up|down
  const next = String(formData.get("next") || "") || buildCourseUrl(courseId, type, "module_reordered");
  if (!moduleId || !courseId || !type) throw new Error("Missing fields");

  const { data: mod, error: mErr } = await supabase
    .from("course_modules")
    .select("id, course_id, type, order_index")
    .eq("id", moduleId)
    .maybeSingle();
  if (mErr || !mod) throw new Error(mErr?.message || "Module not found");

  const curOrder = (mod as any).order_index ?? 0;

  let neighbor: { id: string; order_index: number } | null = null;
  if (direction === "up") {
    const { data } = await supabase
      .from("course_modules")
      .select("id, order_index")
      .eq("course_id", courseId).eq("type", type)
      .lt("order_index", curOrder)
      .order("order_index", { ascending: false })
      .limit(1);
    neighbor = (data?.[0] as any) ?? null;
  } else {
    const { data } = await supabase
      .from("course_modules")
      .select("id, order_index")
      .eq("course_id", courseId).eq("type", type)
      .gt("order_index", curOrder)
      .order("order_index", { ascending: true })
      .limit(1);
    neighbor = (data?.[0] as any) ?? null;
  }

  if (neighbor) {
    // 🔒 Avoid unique-constraint collisions: use a temporary sentinel
    const temp = -1; // assume non-negative order; -1 won't exist
    const neighborOrder = (neighbor as any).order_index as number;

    // 1) move current to temp
    const { error: eTmp } = await supabase
      .from("course_modules")
      .update({ order_index: temp })
      .eq("id", mod.id);
    if (eTmp) throw new Error(eTmp.message);

    // 2) move neighbor into current's slot
    const { error: eN } = await supabase
      .from("course_modules")
      .update({ order_index: curOrder })
      .eq("id", (neighbor as any).id);
    if (eN) throw new Error(eN.message);

    // 3) move current into neighbor's old slot
    const { error: eC } = await supabase
      .from("course_modules")
      .update({ order_index: neighborOrder })
      .eq("id", mod.id);
    if (eC) throw new Error(eC.message);
  }

  revalidatePath(buildCourseUrl(courseId));
  redirect(next);
}

async function renameModuleAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  const type = String(formData.get("type") ?? "") as ModuleType;
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const next = String(formData.get("next") || "") || buildCourseUrl(courseId, type, "module_renamed");

  if (!moduleId || !courseId || !type || !title) throw new Error("Missing fields");

  const { error } = await supabase.from("course_modules").update({ title }).eq("id", moduleId);
  if (error) throw new Error(error.message);

  revalidatePath(buildCourseUrl(courseId));
  redirect(next);
}

async function deleteModuleAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const moduleId = String(formData.get("module_id") ?? "");
  const courseId = String(formData.get("course_id") ?? "");
  const type = String(formData.get("type") ?? "") as ModuleType;
  const next = String(formData.get("next") || "") || buildCourseUrl(courseId, type, "module_deleted");
  if (!moduleId || !courseId || !type) throw new Error("Missing fields");

  // If this is a quiz module, best-effort delete any linked quiz rows first to avoid orphans
  if (type === "digital_assessment_quiz") {
    try {
      await supabase.from("quizzes").delete().eq("module_id", moduleId);
    } catch {}
  }

  const { error } = await supabase.from("course_modules").delete().eq("id", moduleId);
  if (error) throw new Error(error.message);

  // Renumber remaining
  const { data: rest } = await supabase
    .from("course_modules")
    .select("id, order_index")
    .eq("course_id", courseId).eq("type", type)
    .order("order_index", { ascending: true });

  if (rest && rest.length) {
    for (let i = 0; i < rest.length; i++) {
      const r = rest[i] as any;
      if (r.order_index !== i) {
        await supabase.from("course_modules").update({ order_index: i }).eq("id", r.id);
      }
    }
  }

  revalidatePath(buildCourseUrl(courseId));
  redirect(next);
}

/**
 * Push the current course snapshot to SafeFLITE. Non-blocking: any failure is
 * logged inside upsertTrainingControl and never throws.
 */
async function syncCourseToSafeflite(courseId: string) {
  const { data: course } = await supabaseAdmin()
    .from("courses")
    .select("id, title, status, safeflite_risk_ids")
    .eq("id", courseId)
    .maybeSingle();

  if (!course) return;

  const isArchived = course.status === "archived";

  await upsertTrainingControl({
    external_id: course.id,
    course_title: course.title || "Untitled Course",
    course_status: course.status || undefined,
    preview_url: toAbsoluteUrl(`/courses/${course.id}`),
    risk_ids: Array.isArray(course.safeflite_risk_ids) ? course.safeflite_risk_ids : [],
    archived: isArchived,
  });
}

async function updateCourseStatusAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const courseId = String(formData.get("course_id") || "");
  const status = String(formData.get("status") || "draft") as "draft" | "published" | "archived";
  const next = String(formData.get("next") || "") || buildCourseUrl(courseId, "details", "status_updated");
  if (!courseId) throw new Error("Missing course_id");

  const { error } = await supabase.from("courses").update({ status }).eq("id", courseId);
  if (error) throw new Error(error.message);

  // Sync status change (incl. archive/unarchive) to SafeFLITE
  await syncCourseToSafeflite(courseId);

  revalidatePath(buildCourseUrl(courseId));
  redirect(next);
}

/** ✅ UPDATED: Details save now supports department + tags (keeps your valid_for_months) */
async function updateCourseDetails(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const courseId = String(formData.get("course_id") || "");
  const next = String(formData.get("next") || "") || buildCourseUrl(courseId, "details", "saved");
  if (!courseId) throw new Error("Missing course_id");

  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();

  const validForDaysStr = String(formData.get("valid_for_days") || "");
  const retakeDaysStr = String(formData.get("retake_reminder_days") || "");

  // NEW: department (select or new)
  const deptSelect = String(formData.get("department_select") || "").trim();
  const deptNew = String(formData.get("department_new") || "").trim();
  const department = deptNew || deptSelect || null;

  // NEW: tags CSV -> text[]
  const tagsCsv = String(formData.get("tags_csv") || "").trim();
  const tags =
    tagsCsv.length === 0
      ? []
      : Array.from(new Set(tagsCsv.split(",").map((t) => t.trim()).filter(Boolean)));

  // NEW: SafeFLITE risk ids (checkbox group) -> text[]
  // Only trust the submitted checkboxes when the picker actually rendered (i.e. the
  // SafeFLITE risk register loaded). If SafeFLITE was unreachable the picker is hidden
  // and submits nothing — in that case we must NOT clobber the saved risk IDs.
  const riskPickerAvailable = String(formData.get("risk_picker_available") || "") === "1";
  const safefliteRiskIds = Array.from(
    new Set(formData.getAll("safeflite_risk_ids").map((v) => String(v).trim()).filter(Boolean))
  );

  // NEW: external contractors checkbox
  const externalContractors = formData.get("external_contractors") === "on";
  const flowType = String(formData.get("contractor_flow_type") || "").trim() || null;
  const contractorSiteId = String(formData.get("contractor_site_id") || "").trim() || null;
  
  // Set flow types based on selection
  let contractorFlowType: string | null = null;
  let visitorFlowType: string | null = null;
  
  if (flowType === "visitor_induction") {
    visitorFlowType = "visitor_induction";
  } else if (flowType === "site_induction" || flowType === "airside_induction") {
    contractorFlowType = flowType;
  }

  const updatePayload: Record<string, any> = {};
  if (title.length > 0) updatePayload.title = title;
  updatePayload.description = description;

  if (validForDaysStr !== "") {
    const val = Number(validForDaysStr);
    updatePayload.valid_for_days = Number.isFinite(val) && val >= 0 ? val : null;
  }

  if (retakeDaysStr) updatePayload.retake_reminder_days = Number(retakeDaysStr);

  // NEW fields
  updatePayload.department = department;
  updatePayload.tags = tags;
  if (riskPickerAvailable) updatePayload.safeflite_risk_ids = safefliteRiskIds;
  updatePayload.for_contractors = externalContractors;
  updatePayload.contractor_flow_type = externalContractors ? contractorFlowType : null;
  updatePayload.contractor_site_id = externalContractors ? contractorSiteId : null;
  updatePayload.visitor_flow_type = externalContractors ? visitorFlowType : null;

  // Use admin client to bypass schema cache issues with newer columns
  const { error } = await supabaseAdmin().from("courses").update(updatePayload).eq("id", courseId);
  if (error) throw new Error(`Save failed: ${error.message}`);

  // Push the updated risk selection + snapshot to SafeFLITE
  await syncCourseToSafeflite(courseId);

  revalidatePath(buildCourseUrl(courseId));
  redirect(next);
}

/** Assignments (robust: enrolment auto-create/approve + comprehensive notifications) */
async function assignUserAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const courseId = String(formData.get("course_id") || "");
  const userId = String(formData.get("user_id") || "");
  const role = String(formData.get("role") || "trainee") as
    | "trainee"
    | "onsite_trainer"
    | "onsite_assessor";
  const next =
    String(formData.get("next") || "") ||
    buildCourseUrl(courseId, "assignments", "assigned");

  if (!courseId || !userId) throw new Error("Missing course_id or user_id");

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  if (!user) throw new Error("Not authenticated");

  // Get course and assigner details for notifications
  let courseTitle = "Course";
  let assignerName = "Admin";
  try {
    const [courseResult, assignerResult] = await Promise.all([
      supabase.from("courses").select("title").eq("id", courseId).maybeSingle(),
      supabase.from("profiles").select("full_name, first_name, last_name").eq("id", user.id).maybeSingle()
    ]);

    courseTitle = courseResult.data?.title || "Course";
    const profile = assignerResult.data;
    if (profile) {
      assignerName = profile.full_name || 
        (profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}`.trim() : null) ||
        "Admin";
    }
  } catch {
    // Use defaults if lookup fails
  }

  // Try RPC first if present
  const rpc = await supabase.rpc("assign_course_user", {
    p_course_id: courseId,
    p_user_id: userId,
    p_role: role,
    p_created_by: user.id,
  });

  if (rpc.error) {
    // Fallback: upsert assignment row
    await supabase
      .from("course_assignments")
      .upsert(
        [{ course_id: courseId, user_id: userId, role, created_by: user.id }],
        { onConflict: "course_id,user_id,role" }
      );

    // If trainee, ensure enrolment exists & is approved/in_progress
    if (role === "trainee") {
      const { data: existing } = await supabase
        .from("course_enrolments")
        .select("id,status")
        .eq("course_id", courseId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existing) {
        await supabase.from("course_enrolments").insert({
          course_id: courseId,
          user_id: userId,
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        });
      } else if (existing.status !== "approved" && existing.status !== "in_progress") {
        await supabase
          .from("course_enrolments")
          .update({ 
            status: "approved",
            approved_by: user.id,
            approved_at: new Date().toISOString()
          })
          .eq("id", existing.id);
      }
    }
  }

  // Send comprehensive notification using the new notification system
  try {
    const { createNotification } = await import("@/app/app/_actions/notifications");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const roleDisplayName = role === "trainee" ? "Trainee" : 
                           role === "onsite_trainer" ? "Onsite Trainer" : 
                           "Onsite Assessor";

    const notificationTitle = role === "trainee" ? 
      `Course Assigned: ${courseTitle}` :
      `${roleDisplayName} Role Assigned: ${courseTitle}`;

    const notificationBody = role === "trainee" ?
      `You have been enrolled in "${courseTitle}" by ${assignerName}. You can start learning now!` :
      `You have been assigned as ${roleDisplayName} for "${courseTitle}" by ${assignerName}.`;

    const courseUrl = role === "trainee" ? 
      `${siteUrl}/app/learn/courses/${courseId}` :
      `${siteUrl}/app/creator/courses/${courseId}`;

    await createNotification({
      recipientUserId: userId,
      type: "enrolment_approved", // Use existing enum value
      title: notificationTitle,
      body: notificationBody,
      sendTeams: true,
      data: {
        courseTitle,
        courseId,
        role,
        roleDisplayName,
        assignedBy: assignerName,
        assignedById: user.id,
        url: courseUrl,
        // Use a unique event ID to prevent duplicate notifications
        event_id: `course_assign_${courseId}_${userId}_${role}_${Date.now()}`
      }
    });
  } catch (notifyError) {
    console.warn("Failed to send course assignment notification:", notifyError);
    // Don't fail the assignment if notification fails
  }

  revalidatePath(buildCourseUrl(courseId));
  redirect(next);
}

async function revokeAssignmentAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const courseId = String(formData.get("course_id") || "");
  const assignmentId = String(formData.get("assignment_id") || "");
  const next = String(formData.get("next") || "") || buildCourseUrl(courseId, "assignments", "revoked");
  if (!courseId || !assignmentId) throw new Error("Missing course_id or assignment_id");

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  if (!user) throw new Error("Not authenticated");

  // Get assignment details before deletion for notification
  let assignmentDetails: { user_id: string; role: "trainee" | "onsite_trainer" | "onsite_assessor"; course_id: string } | null = null;
  try {
    const { data: assignment } = await supabase
      .from("course_assignments")
      .select("user_id, role, course_id")
      .eq("id", assignmentId)
      .maybeSingle();
    assignmentDetails = assignment;
  } catch {
    // Continue with deletion even if we can't get details
  }

  const { error } = await supabase.from("course_assignments").delete().eq("id", assignmentId);
  if (error) throw new Error(error.message);

  // Send revocation notification
  if (assignmentDetails) {
    try {
      const { createNotification } = await import("@/app/app/_actions/notifications");

      // Get course and revoker details
      let courseTitle = "Course";
      let revokerName = "Admin";
      try {
        const [courseResult, revokerResult] = await Promise.all([
          supabase.from("courses").select("title").eq("id", courseId).maybeSingle(),
          supabase.from("profiles").select("full_name, first_name, last_name").eq("id", user.id).maybeSingle()
        ]);

        courseTitle = courseResult.data?.title || "Course";
        const profile = revokerResult.data;
        if (profile) {
          revokerName = profile.full_name || 
            (profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}`.trim() : null) ||
            "Admin";
        }
      } catch {
        // Use defaults
      }

      const roleDisplayName = assignmentDetails.role === "trainee" ? "Trainee" : 
                             assignmentDetails.role === "onsite_trainer" ? "Onsite Trainer" : 
                             "Onsite Assessor";

      await createNotification({
        recipientUserId: assignmentDetails.user_id,
        type: "enrolment_revoked", // Use existing enum value
        title: `Assignment Revoked: ${courseTitle}`,
        body: `Your ${roleDisplayName} assignment for "${courseTitle}" has been revoked by ${revokerName}.`,
        sendTeams: true,
        data: {
          courseTitle,
          courseId,
          role: assignmentDetails.role,
          roleDisplayName,
          revokedBy: revokerName,
          revokedById: user.id,
          event_id: `course_revoke_${courseId}_${assignmentDetails.user_id}_${assignmentDetails.role}_${Date.now()}`
        }
      });
    } catch (notifyError) {
      console.warn("Failed to send assignment revocation notification:", notifyError);
    }
  }

  revalidatePath(buildCourseUrl(courseId));
  redirect(next);
}

/** Search params interface for this page */
interface CourseEditorSearchParams extends Record<string, string | string[] | undefined> {
  notice?: string | string[] | undefined;
}

/** Page */
export default async function CourseEditorPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<CourseEditorSearchParams>;
}) {
  const { id: courseId } = await props.params;
  const searchParams: CourseEditorSearchParams = (await (props.searchParams ?? Promise.resolve({}))) || {};

  const activeTab = tabKeyFromSearch(searchParams);
  const noticeCode =
    (Array.isArray(searchParams?.notice) ? searchParams?.notice[0] : searchParams?.notice) || undefined;
  const banner = noticeMessage(noticeCode);

  const { course, err } = await loadCourse(courseId);
  if (err || !course) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Course Editor</h1>
        <p className="text-red-600">Error: {err ?? "Course not found"}</p>
        <Link href="/app/creator" className="text-blue-600 underline">Back</Link>
      </div>
    );
  }

  const supabaseForSites = await createSupabaseServer();
  const [digitalTraining, quizModules, onsiteTraining, onsiteAssessment, sitesResult, safefliteRisks] = await Promise.all([
    loadModules(courseId, "digital_training"),
    loadModules(courseId, "digital_assessment_quiz"),
    loadModules(courseId, "onsite_training"),
    loadModules(courseId, "onsite_assessment"),
    supabaseForSites.from("sites").select("id, name").eq("active", true).order("name"),
    listSafefliteRisks(),
  ]);
  const sites = sitesResult.data || [];

  const tabs: { key: TabKey; href: string }[] = [
    { key: "details", href: buildCourseUrl(courseId, "details") },
    { key: "digital_training", href: buildCourseUrl(courseId, "digital_training") },
    { key: "digital_assessment_quiz", href: buildCourseUrl(courseId, "digital_assessment_quiz") },
    { key: "onsite_training", href: buildCourseUrl(courseId, "onsite_training") },
    { key: "onsite_assessment", href: buildCourseUrl(courseId, "onsite_assessment") },
    { key: "assignments", href: buildCourseUrl(courseId, "assignments") },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{course.title ?? "Untitled Course"}</h1>
          <div className="mt-1">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                course.status === "published"
                  ? "bg-green-100 text-green-700"
                  : course.status === "archived"
                  ? "bg-gray-200 text-gray-700"
                  : "bg-yellow-100 text-yellow-800"
              }`}
              title="Course status"
            >
              {course.status}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/app/learn/courses/${course.id}?preview=1`}
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
            title="Open learner preview in a new tab"
            target="_blank"
          >
            Test as learner
          </Link>
          <Link href="/app/creator" className="rounded-md border px-3 py-1 text-sm">Back</Link>
        </div>
      </div>

      {/* Flash banner */}
      {banner && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          {banner}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const isActive = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={[
                "rounded-md px-3 py-1 text-sm",
                isActive ? "bg-black text-white" : "border text-gray-800 hover:bg-gray-50",
              ].join(" ")}
            >
              {tabLabel(t.key)}
            </Link>
          );
        })}
      </div>

      {/* Active tab content */}
      <div className="rounded-xl border p-4">
        {activeTab === "details" && (
          <DetailsTab
            course={course}
            courseUrlFor={(notice: string) => buildCourseUrl(courseId, "details", notice)}
            sites={sites}
            safefliteRisks={safefliteRisks}
          />
        )}

        {activeTab === "digital_training" && (
          <SectionModules
            courseId={courseId}
            title="Digital Training Modules"
            hint="Add learning content blocks (text, files, videos, links)."
            type="digital_training"
            modules={digitalTraining}
          />
        )}

        {activeTab === "digital_assessment_quiz" && (
          <SectionModules
            courseId={courseId}
            title="Digital Assessment (Quiz)"
            hint="Add quiz modules and manage questions."
            type="digital_assessment_quiz"
            modules={quizModules}
          />
        )}

        {activeTab === "onsite_training" && (
          <SectionModules
            courseId={courseId}
            title="Onsite Training Modules"
            hint="Add training events, trainer notes, etc."
            type="onsite_training"
            modules={onsiteTraining}
          />
        )}

        {activeTab === "onsite_assessment" && (
          <SectionModules
            courseId={courseId}
            title="Onsite Assessment Modules"
            hint="Add assessment activities and criteria."
            type="onsite_assessment"
            modules={onsiteAssessment}
          />
        )}

        {activeTab === "assignments" && (
          <AssignmentsLoader courseId={courseId} searchParams={searchParams} />
        )}
      </div>
    </div>
  );
}

/** DETAILS TAB (unchanged aside from earlier department/tags support) */
const DEFAULT_DEPARTMENTS = [
  "Skydive",
  "Helicopter",
  "Fixed wing",
  "Inflite general",
  "Safety",
] as const;

function DetailsTab({
  course,
  courseUrlFor,
  sites,
  safefliteRisks,
}: {
  course: any;
  courseUrlFor: (notice: string) => string;
  sites: { id: string; name: string }[];
  safefliteRisks: SafefliteRisk[];
}) {
  const title = (course?.title as string) ?? "";
  const description = (course?.description as string) ?? "";

  const hasValidFor = Object.prototype.hasOwnProperty.call(course ?? {}, "valid_for_days");
  const validForDays = hasValidFor ? (course.valid_for_days as number | null) : null;

  const hasRetakeDays = Object.prototype.hasOwnProperty.call(course ?? {}, "retake_reminder_days");

  const department = (course?.department as string | null) ?? "";
  const tagsArray: string[] = Array.isArray(course?.tags) ? course.tags : [];
  const tagsCsv = tagsArray.join(", ");

  const selectedRiskIds: string[] = Array.isArray(course?.safeflite_risk_ids)
    ? course.safeflite_risk_ids
    : [];
  const selectedRiskSet = new Set(selectedRiskIds);

  return (
    <div className="space-y-8">
      {/* FORM 1 */}
      <form action={updateCourseDetails} className="space-y-4">
        <input type="hidden" name="course_id" value={course.id} />
        <input type="hidden" name="next" value={courseUrlFor("saved")} />

        <div className="grid gap-2">
          <label className="text-sm">Course title</label>
          <input
            name="title"
            defaultValue={title}
            className="w-full rounded-md border px-3 py-2"
            placeholder="Enter course title"
            required
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm">Description</label>
          <textarea
            name="description"
            defaultValue={description}
            className="w-full rounded-md border px-3 py-2 min-h-[120px]"
            placeholder="What will learners get from this course?"
          />
        </div>

        {/* Department */}
        <div className="grid gap-1">
          <label className="text-sm">Department</label>
          <select
            name="department_select"
            defaultValue={department || ""}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="">— Select department —</option>
            {DEFAULT_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <div className="text-xs text-gray-500">Or add a new department name:</div>
          <input
            name="department_new"
            className="w-full rounded-md border px-3 py-2"
            placeholder="Type a new department (optional)"
          />
        </div>

        {/* Tags */}
        <div className="grid gap-1">
          <label className="text-sm">Tags</label>
          <input
            name="tags_csv"
            defaultValue={tagsCsv}
            className="w-full rounded-md border px-3 py-2"
            placeholder="e.g. safety, refresher, induction"
          />
          <div className="text-xs text-gray-500">Comma-separated. Used later for search & filtering.</div>
        </div>

        {/* SafeFLITE Risks */}
        <div className="grid gap-1">
          <input
            type="hidden"
            name="risk_picker_available"
            value={safefliteRisks.length > 0 ? "1" : "0"}
          />
          <label className="text-sm">SafeFLITE Risks</label>
          <div className="text-xs text-gray-500">
            Tick the SafeFLITE risks this course helps mitigate. Saving will sync the selection to SafeFLITE.
          </div>
          {safefliteRisks.length === 0 ? (
            <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-500">
              No SafeFLITE risks available right now. You can still save the course; the risk
              selection can be updated once the SafeFLITE connection is reachable.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {safefliteRisks.map((risk) => (
                <label
                  key={risk.id}
                  className="flex items-start gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    name="safeflite_risk_ids"
                    value={risk.id}
                    defaultChecked={selectedRiskSet.has(risk.id)}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="font-medium">{risk.risk_code}</span>
                    {" — "}
                    {risk.title}
                    <span className="ml-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {risk.risk_kind}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* External Contractors */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="external_contractors"
            name="external_contractors"
            defaultChecked={course?.for_contractors || false}
            className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="external_contractors" className="text-sm font-medium text-gray-900">
            Use for external contractors
          </label>
        </div>
        <div className="text-xs text-gray-500 -mt-2 ml-7">
          This course will be available to external contractors via the Contractors portal.
        </div>

        {/* Contractor/Visitor Flow Options - always shown, configured when external contractors is checked */}
        <div className="ml-7 space-y-4 border-l-2 border-blue-200 pl-4 bg-blue-50/30 py-3 rounded-r-md">
          <div className="text-sm font-medium text-blue-800 mb-2">
            Contractor/Visitor Flow Settings
          </div>
          
          <div className="grid gap-2">
            <label className="text-sm font-medium">Site</label>
            <select
              name="contractor_site_id"
              defaultValue={course?.contractor_site_id || ""}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">All sites</option>
              {sites.map((site: any) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <div className="text-xs text-gray-500">
              Which site this course applies to.
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Flow Type</label>
            <select
              name="contractor_flow_type"
              defaultValue={course?.contractor_flow_type || course?.visitor_flow_type || ""}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">Select flow type...</option>
              <option value="visitor_induction">Visitor Induction</option>
              <option value="site_induction">Site Induction (Contractor - No to airside)</option>
              <option value="airside_induction">Airside Induction (Contractor - Yes to airside)</option>
            </select>
            <div className="text-xs text-gray-500">
              Which flow this course belongs to (Visitor or Contractor flows).
            </div>
          </div>
        </div>
        
        <input type="hidden" name="visitor_flow_type" value="" />

        {hasValidFor && (
          <div className="grid gap-2">
            <label className="text-sm">Valid for (days)</label>
            <input
              type="number"
              name="valid_for_days"
              min={0}
              defaultValue={course.valid_for_days == null ? "" : String(course.valid_for_days)}
              className="w-full rounded-md border px-3 py-2"
              placeholder="e.g., 365 (leave empty for no expiry)"
            />
            <p className="text-xs text-gray-500">
              The certificate/competency will expire this many days after the learner completes the course. Leave empty for no expiry.
            </p>
          </div>
        )}

        {hasRetakeDays && (
          <div className="grid gap-2">
            <label className="text-sm">Retake reminder (days)</label>
            <input
              type="number"
              name="retake_reminder_days"
              min={0}
              defaultValue={course.retake_reminder_days ?? ""}
              className="w-full rounded-md border px-3 py-2"
              placeholder="e.g., 30"
            />
            <p className="text-xs text-gray-500">
              Users will receive daily notifications starting this many days before their certification expires.
            </p>
          </div>
        )}

        <div className="pt-2">
          <button className="rounded-md bg-black px-4 py-2 text-white">Save</button>
        </div>
      </form>

      {/* FORM 2: Status */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="font-semibold">Course status</div>
        <form action={updateCourseStatusAction} className="flex items-center gap-3">
          <input type="hidden" name="course_id" value={course.id} />
          <input type="hidden" name="next" value={courseUrlFor("status_updated")} />
          <select
            name="status"
            defaultValue={course.status ?? "draft"}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">
            Update status
          </button>
        </form>
        <div className="text-xs text-gray-500">
          Draft: only editors/owners see it. Published: visible to learners. Archived: hidden for new learners.
        </div>
      </div>

      {/* Resit notification menu for published courses */}
      <ResitNotificationMenu courseId={course.id} courseStatus={course.status} />
    </div>
  );
}

/** List + create modules (server component) */
async function SectionModules(props: {
  courseId: string;
  title: string;
  hint?: string;
  type: ModuleType;
  modules: any[];
}) {
  const { courseId, title, hint, type, modules } = props;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {hint ? <p className="text-sm text-gray-500">{hint}</p> : null}
        </div>
        {/* CREATE with title */}
        <form action={createModuleAction} className="flex items-center gap-2">
          <input type="hidden" name="course_id" value={courseId} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={buildCourseUrl(courseId, type, "module_created")} />
          <input
            name="title"
            placeholder="Module name…"
            className="rounded-md border px-3 py-2 text-sm w-64"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">+ Create Module</button>
        </form>
      </div>

      {modules.length === 0 ? (
        <p className="text-sm text-gray-500">No modules yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {modules.map((m: any) => {
            const href = moduleEditHref(type, m.id);
            const displayTitle =
              m.title ||
              (type === "onsite_assessment"
                ? "Onsite Assessment"
                : type === "onsite_training"
                ? "Onsite Training"
                : type === "digital_assessment_quiz"
                ? "Digital Quiz"
                : "Training Module");

            return (
              <li key={m.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <Link href={href} className="text-sm font-medium underline">
                      {displayTitle}
                    </Link>
                    <div className="text-xs text-gray-500">
                      Order: {m.order_index} {m.created_at ? `• Created ${fmtUTC(m.created_at)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Move up */}
                    <form action={moveModuleAction}>
                      <input type="hidden" name="module_id" value={m.id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="type" value={type} />
                      <input type="hidden" name="direction" value="up" />
                      <input type="hidden" name="next" value={buildCourseUrl(courseId, type, "module_reordered")} />
                      <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" title="Move up">
                        ↑
                      </button>
                    </form>

                    {/* Move down */}
                    <form action={moveModuleAction}>
                      <input type="hidden" name="module_id" value={m.id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="type" value={type} />
                      <input type="hidden" name="direction" value="down" />
                      <input type="hidden" name="next" value={buildCourseUrl(courseId, type, "module_reordered")} />
                      <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" title="Move down">
                        ↓
                      </button>
                    </form>

                    {/* Delete */}
                    <form action={deleteModuleAction}>
                      <input type="hidden" name="module_id" value={m.id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="type" value={type} />
                      <input type="hidden" name="next" value={buildCourseUrl(courseId, type, "module_deleted")} />
                      <button className="rounded border px-2 py-1 text-xs hover:bg-red-50" title="Delete">
                        Delete
                      </button>
                    </form>

                    {/* Inline rename */}
                    <details>
                      <summary className="cursor-pointer text-xs underline">Rename</summary>
                      <form action={renameModuleAction} className="mt-2 flex items-center gap-2">
                        <input type="hidden" name="module_id" value={m.id} />
                        <input type="hidden" name="course_id" value={courseId} />
                        <input type="hidden" name="type" value={type} />
                        <input type="hidden" name="next" value={buildCourseUrl(courseId, type, "module_renamed")} />
                        <input
                          name="title"
                          defaultValue={m.title ?? ""}
                          placeholder="New name…"
                          className="rounded-md border px-3 py-1.5 text-sm w-72"
                          required
                        />
                        <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">Save</button>
                      </form>
                    </details>

                    {/* Open */}
                    <Link href={href} className="rounded bg-black px-3 py-1 text-xs text-white">
                      Open
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** ASSIGNMENTS tab loader and component */
async function AssignmentsLoader({
  courseId,
  searchParams,
}: {
  courseId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = (Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q) ?? null;
  const [data, results] = await Promise.all([loadAssignments(courseId), searchProfilesByQuery(q)]);
  return <AssignmentsTab courseId={courseId} data={data} searchResults={results} />;
}

function AssignmentsTab({
  courseId,
  data,
  searchResults,
}: {
  courseId: string;
  data: { assignments: AssignmentRow[]; profileMap: Map<string, Profile> };
  searchResults: Profile[];
}) {
  const { assignments, profileMap } = data;

  return (
    <div className="space-y-6">
      {/* Search + assign */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Assign people</h2>
          <form method="get" action={buildCourseUrl(courseId, "assignments")}>
            <input type="hidden" name="tab" value="assignments" />
            <div className="flex items-center gap-2">
              <input
                type="text"
                name="q"
                className="w-72 rounded-md border px-3 py-2 text-sm"
                placeholder="Search name or email"
              />
              <button className="rounded-md border px-3 py-2 text-sm">Search</button>
            </div>
          </form>
        </div>

        {searchResults.length > 0 ? (
          <div className="space-y-2">
            <div className="text-sm text-gray-600">Results</div>
            <ul className="divide-y rounded-md border bg-white">
              {searchResults.map((p) => (
                <li key={p.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{p.full_name ?? "(no name)"}</div>
                    <div className="text-xs text-gray-500">{p.email ?? ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={assignUserAction} className="flex items-center gap-2">
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="user_id" value={p.id} />
                      <input type="hidden" name="next" value={buildCourseUrl(courseId, "assignments", "assigned")} />
                      <select name="role" defaultValue="trainee" className="rounded-md border px-2 py-1 text-xs">
                        <option value="trainee">Trainee</option>
                        <option value="onsite_trainer">Onsite trainer</option>
                        <option value="onsite_assessor">Onsite assessor</option>
                      </select>
                      <button className="rounded-md bg-black px-3 py-1 text-xs text-white">Assign</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Search to find people to assign.</p>
        )}
      </div>

      {/* Existing assignments */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-lg font-semibold">Current assignments</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-gray-500">No one assigned yet.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-white">
            {assignments.map((a) => {
              const p = profileMap.get(a.user_id);
              return (
                <li key={a.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{p?.full_name ?? a.user_id}</div>
                    <div className="text-xs text-gray-500">{p?.email ?? ""} • {a.role.replace("_", " ")}</div>
                  </div>
                  <form action={revokeAssignmentAction}>
                    <input type="hidden" name="course_id" value={courseId} />
                    <input type="hidden" name="assignment_id" value={a.id} />
                    <input type="hidden" name="next" value={buildCourseUrl(courseId, "assignments", "revoked")} />
                    <button className="rounded-md border px-2 py-1 text-xs hover:bg-red-50">Revoke</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}