// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ResitNotificationMenu from "./_components/ResitNotificationMenu";
import MetadataSuggestions from "./_components/MetadataSuggestions";
import { buildCourseCorpus, loadStoredSuggestion } from "@/lib/course-suggestions";
import SafefliteRiskPicker from "./SafefliteRiskPicker";
import { toAbsoluteUrl } from "@/lib/utils/url";
import { logContentAudit, logModuleContentAudit, diffChanges } from "@/lib/audit";
import { hasRole } from "@/lib/roles";
import { publishNewCourseVersion } from "@/lib/training-history";
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
    case "version_published": return "New course version published. Existing learners have been assigned the new version; their prior completions remain in training history.";
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
  current_version_number?: number;
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

  if (inserted) {
    const { data: { user } } = await supabase.auth.getUser();
    await logModuleContentAudit({
      moduleId: inserted.id,
      courseId,
      moduleTitle: title,
      action: "module_added",
      actorId: user?.id ?? null,
      details: { item: `${title} (${type.replace(/_/g, " ")})` },
    });
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

  const { data: oldMod } = await supabase
    .from("course_modules")
    .select("title")
    .eq("id", moduleId)
    .maybeSingle();

  const { error } = await supabase.from("course_modules").update({ title }).eq("id", moduleId);
  if (error) throw new Error(error.message);

  if (oldMod && oldMod.title !== title) {
    const { data: { user } } = await supabase.auth.getUser();
    await logModuleContentAudit({
      moduleId,
      courseId,
      moduleTitle: title,
      action: "module_renamed",
      actorId: user?.id ?? null,
      details: { changes: { title: { from: oldMod.title, to: title } } },
    });
  }

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

  const { data: delMod } = await supabase
    .from("course_modules")
    .select("title")
    .eq("id", moduleId)
    .maybeSingle();

  // If this is a quiz module, delete its questions/options and the linked
  // quiz row first, so no quiz_questions rows are left behind as orphans.
  // Questions are linked by quiz_id only (quiz_questions.module_id dropped
  // in migration 024), so resolve the module's quizzes first.
  if (type === "digital_assessment_quiz") {
    const { data: moduleQuizzes, error: mqErr } = await supabase
      .from("quizzes")
      .select("id")
      .eq("module_id", moduleId);
    if (mqErr) throw new Error(`Quiz lookup failed: ${mqErr.message}`);
    const quizIds = (moduleQuizzes ?? []).map((q: any) => q.id);
    const { data: moduleQuestions, error: qErr } = quizIds.length > 0
      ? await supabase
          .from("quiz_questions")
          .select("id")
          .in("quiz_id", quizIds)
      : { data: [], error: null };
    if (qErr) throw new Error(`Quiz question lookup failed: ${qErr.message}`);
    const qIds = (moduleQuestions ?? []).map((q: any) => q.id);
    if (qIds.length > 0) {
      const { error: oErr } = await supabase
        .from("quiz_options")
        .delete()
        .in("question_id", qIds);
      if (oErr) throw new Error(`Quiz option cleanup failed: ${oErr.message}`);
      const { error: qDelErr } = await supabase
        .from("quiz_questions")
        .delete()
        .in("id", qIds);
      if (qDelErr) throw new Error(`Quiz question cleanup failed: ${qDelErr.message}`);
    }
    const { error: quizDelErr } = await supabase
      .from("quizzes")
      .delete()
      .eq("module_id", moduleId);
    if (quizDelErr) throw new Error(`Quiz cleanup failed: ${quizDelErr.message}`);
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
    const updates: Promise<any>[] = [];
    for (let i = 0; i < rest.length; i++) {
      const r = rest[i] as any;
      if (r.order_index !== i) {
        updates.push(
          supabase.from("course_modules").update({ order_index: i }).eq("id", r.id).then()
        );
      }
    }
    await Promise.all(updates);
  }

  {
    const { data: { user } } = await supabase.auth.getUser();
    await logModuleContentAudit({
      moduleId,
      courseId,
      moduleTitle: delMod?.title || "(unknown module)",
      action: "module_removed",
      actorId: user?.id ?? null,
      details: { item: `${delMod?.title || "Module"} (${type.replace(/_/g, " ")})` },
    });
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
    preview_url: toAbsoluteUrl(`/app/learn/courses/${course.id}?preview=1`),
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

  const { data: { user } } = await supabase.auth.getUser();
  const { data: oldCourse } = await supabase
    .from("courses")
    .select("title, status")
    .eq("id", courseId)
    .maybeSingle();

  const { error } = await supabase.from("courses").update({ status }).eq("id", courseId);
  if (error) throw new Error(error.message);

  if (oldCourse && oldCourse.status !== status) {
    await logContentAudit({
      entityType: "course",
      entityId: courseId,
      entityName: oldCourse.title,
      action: "status_changed",
      actorId: user?.id ?? null,
      details: { changes: { status: { from: oldCourse.status, to: status } } },
    });
  }

  // Sync status change (incl. archive/unarchive) to SafeFLITE
  await syncCourseToSafeflite(courseId);

  revalidatePath(buildCourseUrl(courseId));
  redirect(next);
}

async function publishNewVersionAction(formData: FormData) {
  "use server";
  const courseId = String(formData.get("course_id") || "");
  const confirmed = formData.get("confirm_release") === "yes";
  const changeNotes = String(formData.get("change_notes") || "").trim() || null;
  if (!courseId) throw new Error("Missing course_id");
  if (!confirmed) throw new Error("Confirm that this release requires every assigned learner to start the new version.");

  const canPublish =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canPublish) throw new Error("You do not have permission to publish course versions.");

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const result = await publishNewCourseVersion({
    courseId,
    actorId: user.id,
    changeNotes,
  });

  const { data: releasedCourse } = await supabaseAdmin()
    .from("courses")
    .select("title")
    .eq("id", courseId)
    .maybeSingle();
  await logContentAudit({
    entityType: "course",
    entityId: courseId,
    entityName: releasedCourse?.title || "Course",
    action: "new_version_published",
    actorId: user.id,
    details: {
      version_number: result.versionNumber,
      learner_assignments_reset: result.resetCount,
      change_notes: changeNotes,
    },
  });

  revalidatePath(buildCourseUrl(courseId));
  redirect(buildCourseUrl(courseId, "details", "version_published"));
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

  // Snapshot the old row for the audit diff
  const { data: { user } } = await supabase.auth.getUser();
  const { data: oldCourse } = await supabaseAdmin()
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .maybeSingle();

  // Use admin client to bypass schema cache issues with newer columns
  const { error } = await supabaseAdmin().from("courses").update(updatePayload).eq("id", courseId);
  if (error) throw new Error(`Save failed: ${error.message}`);

  const changes = diffChanges(oldCourse, updatePayload);
  if (Object.keys(changes).length > 0) {
    await logContentAudit({
      entityType: "course",
      entityId: courseId,
      entityName: (updatePayload.title as string) || oldCourse?.title || null,
      action: "updated",
      actorId: user?.id ?? null,
      details: { changes },
    });
  }

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

  // Guard: never assign learners to unpublished (draft/archived) courses —
  // draft-course content is hidden from learners and surfaces as broken quizzes.
  if (role === "trainee") {
    const { data: courseStatusRow, error: courseStatusErr } = await supabase
      .from("courses")
      .select("id, title, status")
      .eq("id", courseId)
      .maybeSingle();
    if (courseStatusErr || !courseStatusRow) {
      throw new Error("Could not verify course status");
    }
    if (courseStatusRow.status !== "published") {
      throw new Error(
        `Cannot assign learners to "${courseStatusRow.title}" while it is ${courseStatusRow.status}. Publish the course first.`
      );
    }
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

  // Only load what the active tab actually needs, and load it all in parallel
  // with the course itself (instead of a sequential waterfall).
  const isModuleTab =
    activeTab === "digital_training" ||
    activeTab === "digital_assessment_quiz" ||
    activeTab === "onsite_training" ||
    activeTab === "onsite_assessment";

  const loadDetailsData = async () => {
    if (activeTab !== "details") {
      return {
        sites: [] as { id: string; name: string }[],
        safefliteRisks: [] as SafefliteRisk[],
        peerReviews: [] as any[],
        storedSuggestion: null as any,
        suggestionContentChanged: false,
      };
    }
    const supabaseForSites = await createSupabaseServer();

    const loadPeerReviews = async () => {
      // Degrade gracefully if the table hasn't been created yet
      try {
        const adminClient = supabaseAdmin();
        const { data: reviewsData, error: reviewsError } = await adminClient
          .from("course_peer_reviews")
          .select("id, reviewer_id, reviewer_name, review_date, notes, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false });
        if (!reviewsError && reviewsData) return reviewsData;
      } catch (e) {
        console.warn("Failed to load peer reviews:", e);
      }
      return [] as any[];
    };

    const loadRisks = async () => {
      // The SafeFLITE risk register lives on an external service; never let it
      // block the page for long or fail the render.
      try {
        return await listSafefliteRisks();
      } catch (e) {
        console.warn("Failed to load SafeFLITE risks:", e);
        return [] as SafefliteRisk[];
      }
    };

    // Last stored metadata suggestion + change detection. Never let this
    // block or fail the render (table may not exist yet, content may be big).
    const loadSuggestionState = async () => {
      try {
        const stored = await loadStoredSuggestion(courseId);
        if (!stored) return { storedSuggestion: null, suggestionContentChanged: false };
        const corpus = await buildCourseCorpus(courseId);
        return {
          storedSuggestion: {
            title: stored.suggested_title,
            description: stored.suggested_description,
            tags: Array.isArray(stored.suggested_tags) ? stored.suggested_tags : [],
            source: stored.source,
          },
          suggestionContentChanged: corpus.hash !== stored.content_hash,
        };
      } catch (e) {
        console.warn("Failed to load metadata suggestion state:", e);
        return { storedSuggestion: null, suggestionContentChanged: false };
      }
    };

    const [sitesResult, safefliteRisks, peerReviews, suggestionState] = await Promise.all([
      supabaseForSites.from("sites").select("id, name").eq("active", true).order("name"),
      loadRisks(),
      loadPeerReviews(),
      loadSuggestionState(),
    ]);
    return { sites: sitesResult.data || [], safefliteRisks, peerReviews, ...suggestionState };
  };

  // Phase 1: auth + course existence check (loadCourse redirects if signed out).
  const { course, err } = await loadCourse(courseId);

  // Phase 2: only after auth is confirmed, load the active tab's data in parallel.
  const [activeModules, detailsData] =
    !err && course
      ? await Promise.all([
          isModuleTab ? loadModules(courseId, activeTab as ModuleType) : Promise.resolve([]),
          loadDetailsData(),
        ])
      : [[], { sites: [], safefliteRisks: [], peerReviews: [], storedSuggestion: null, suggestionContentChanged: false }];

  if (err || !course) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Course Editor</h1>
        <p className="text-red-600">Error: {err ?? "Course not found"}</p>
        <Link href="/app/creator" className="text-blue-600 underline">Back</Link>
      </div>
    );
  }

  const { sites, safefliteRisks, peerReviews, storedSuggestion, suggestionContentChanged } = detailsData;

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
          <Link
            href={`/app/learn/courses/${course.id}?review=1`}
            className="rounded-md border border-purple-300 bg-purple-50 px-3 py-1 text-sm text-purple-800 hover:bg-purple-100"
            title="Walk through the full course as a learner and record a peer review"
            target="_blank"
          >
            Peer review
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
          <>
            <DetailsTab
              course={course}
              courseUrlFor={(notice: string) => buildCourseUrl(courseId, "details", notice)}
              sites={sites}
              safefliteRisks={safefliteRisks}
              storedSuggestion={storedSuggestion}
              suggestionContentChanged={suggestionContentChanged}
            />
            <PeerReviewsSection reviews={peerReviews} />
          </>
        )}

        {activeTab === "digital_training" && (
          <SectionModules
            courseId={courseId}
            title="Digital Training Modules"
            hint="Add learning content blocks (text, files, videos, links)."
            type="digital_training"
            modules={activeModules}
          />
        )}

        {activeTab === "digital_assessment_quiz" && (
          <SectionModules
            courseId={courseId}
            title="Digital Assessment (Quiz)"
            hint="Add quiz modules and manage questions."
            type="digital_assessment_quiz"
            modules={activeModules}
          />
        )}

        {activeTab === "onsite_training" && (
          <SectionModules
            courseId={courseId}
            title="Onsite Training Modules"
            hint="Add training events, trainer notes, etc."
            type="onsite_training"
            modules={activeModules}
          />
        )}

        {activeTab === "onsite_assessment" && (
          <SectionModules
            courseId={courseId}
            title="Onsite Assessment Modules"
            hint="Add assessment activities and criteria."
            type="onsite_assessment"
            modules={activeModules}
          />
        )}

        {activeTab === "assignments" && (
          <AssignmentsLoader courseId={courseId} searchParams={searchParams} />
        )}
      </div>
    </div>
  );
}

/** PEER REVIEWS SECTION (shown under the Details tab) */
function PeerReviewsSection({ reviews }: { reviews: any[] }) {
  return (
    <div className="mt-6 border-t pt-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Peer Reviews</h2>
          <p className="text-sm text-gray-600">
            Reviews recorded from full course walkthroughs (use the "Peer review" button above to start one).
          </p>
        </div>
        {reviews.length > 0 && (
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800">
            {reviews.length} review{reviews.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="rounded-md border border-dashed bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No peer reviews recorded yet.
        </p>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-md border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">📝</span>
                  <span className="text-sm font-medium text-gray-900">
                    {review.reviewer_name || "Unknown reviewer"}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Reviewed on{" "}
                  {review.review_date
                    ? new Date(`${review.review_date}T00:00:00`).toLocaleDateString()
                    : new Date(review.created_at).toLocaleDateString()}
                </div>
              </div>
              {review.notes && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{review.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
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
  storedSuggestion,
  suggestionContentChanged,
}: {
  course: any;
  courseUrlFor: (notice: string) => string;
  sites: { id: string; name: string }[];
  safefliteRisks: SafefliteRisk[];
  storedSuggestion: { title: string; description: string; tags: string[]; source: "ai" | "extractive" } | null;
  suggestionContentChanged: boolean;
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

  return (
    <div className="space-y-8">
      {/* Suggested metadata from actual training content (nothing saved
          until the form below is submitted) */}
      <MetadataSuggestions
        courseId={course.id}
        currentTitle={title}
        currentDescription={description}
        currentTagsCsv={tagsCsv}
        initialSuggestion={storedSuggestion}
        contentChanged={suggestionContentChanged}
      />

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
            <SafefliteRiskPicker
              risks={safefliteRisks}
              initialSelectedIds={selectedRiskIds}
            />
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
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold">Course status</div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
            Released version {course.current_version_number || 1}
          </span>
        </div>
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

      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-4">
        <div>
          <div className="font-semibold text-amber-950">Publish new required version</div>
          <p className="mt-1 text-sm text-amber-900">
            Use this only when the edited course must be completed again. It freezes the current
            course, quiz questions, onsite requirements, learner results and evidence as a new
            version. Every assigned learner is moved to the new version; previous completions stay
            permanently in their training history.
          </p>
        </div>
        <form action={publishNewVersionAction} className="space-y-3">
          <input type="hidden" name="course_id" value={course.id} />
          <div>
            <label htmlFor="change_notes" className="block text-sm font-medium text-amber-950">
              What changed? <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id="change_notes"
              name="change_notes"
              rows={2}
              className="mt-1 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
              placeholder="e.g. Updated emergency procedure and replaced the final assessment"
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-amber-950">
            <input
              type="checkbox"
              name="confirm_release"
              value="yes"
              required
              className="mt-1"
            />
            <span>
              I understand this creates version {(course.current_version_number || 1) + 1} and
              requires all assigned learners to complete it.
            </span>
          </label>
          <button
            type="submit"
            disabled={course.status !== "published"}
            className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Publish version {(course.current_version_number || 1) + 1}
          </button>
          {course.status !== "published" && (
            <p className="text-xs text-amber-800">Publish the course status first.</p>
          )}
        </form>
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