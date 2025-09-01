// app/app/learn/courses/[id]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import VideoPlayer from '@/components/VideoPlayer';

export const dynamic = "force-dynamic";

/** Types */
type ModuleType =
  | "digital_training"
  | "request_document"
  | "digital_assessment_quiz"
  | "onsite_training"
  | "onsite_assessment";

type BlockKind =
  | "rich_text"
  | "link"
  | "video_embed"
  | "file"
  | "request_document";

const TYPE_ORDER: ModuleType[] = [
  "digital_training",
  "digital_assessment_quiz",
  "onsite_training",
  "onsite_assessment",
];

const TYPE_LABEL: Record<ModuleType, string> = {
  digital_training: "Digital training",
  request_document: "Document request",
  digital_assessment_quiz: "Digital quiz",
  onsite_training: "Onsite training",
  onsite_assessment: "Onsite assessment",
};

/** Helpers */
function typeIcon(t: ModuleType) {
  switch (t) {
    case "digital_training": return "📖";
    case "request_document": return "📎";
    case "digital_assessment_quiz": return "📝";
    case "onsite_training": return "👥";
    case "onsite_assessment": return "✅";
    default: return "•";
  }
}
function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}
function pageUrl(
  courseId: string,
  opts?: { notice?: string | null; step?: number; preview?: boolean }
) {
  const params = new URLSearchParams();
  if (opts?.notice) params.set("notice", opts.notice);
  if (opts?.step) params.set("step", String(opts.step));
  if (opts?.preview) params.set("preview", "1");
  return `/app/learn/courses/${courseId}${params.toString() ? `?${params.toString()}` : ""}`;
}

/** DATA LOAD */
async function loadCourseForLearner(courseId: string, preview: boolean) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !preview) redirect("/auth/signin");

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, status, updated_at")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return { error: "Course not found" } as const;

  let enrolment: any = null; // This will hold the enrolment object if found and relevant
  let assignment: any = null; // This will hold the assignment object if found and relevant

  // Check access via assignment OR enrollment
  const { data: assignmentData } = await supabase
    .from("course_assignments")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();

  console.log("=== ACCESS CHECK DEBUG START ===");
  console.log("Course assignment check:", {
    userId: user.id,
    courseId,
    assignment: assignmentData,
    hasAssignment: !!assignmentData,
    role: assignmentData?.role || null,
    error: null
  });

  let hasAssignmentAccess = false;
  let enrolmentAccess = false;
  let enrolmentId: string | null = null;
  let assignmentId: string | null = null;

  if (assignmentData) {
    hasAssignmentAccess = true;
    assignmentId = assignmentData.id;
    assignment = assignmentData; // Store assignment data for later use
    console.log("✅ Access granted via course assignment");
  }

  if (!hasAssignmentAccess) {
    // Fallback to enrollment check
    const { data: enrolData, error: enrolErr } = await supabase
      .from("course_enrolments")
      .select("id, status, user_id, course_id, created_at")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .maybeSingle();

    console.log("Enrolment check debug (regular client):", {
      table: "course_enrolments",
      userId: user.id,
      courseId,
      enrolment: enrolData,
      hasEnrolment: !!enrolData,
      status: enrolData?.status,
      error: enrolErr?.message || null
    });

    // Check legacy enrolments table
    let legacyEnrolmentData: any = null;
    if (!enrolData) {
      const { data: legacyEnrol, error: legacyEnrolErr } = await supabase
        .from("enrolments")
        .select("id, status, user_id, course_id, created_at")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle();

      console.log("Legacy enrolments table check:", {
        table: "enrolments",
        userId: user.id,
        courseId,
        enrolment: legacyEnrol,
        hasEnrolment: !!legacyEnrol,
        status: legacyEnrol?.status,
        error: legacyEnrolErr?.message || null
      });
      legacyEnrolmentData = legacyEnrol;
    }

    let finalEnrolment = enrolData || legacyEnrolmentData;
    enrolment = finalEnrolment;

    if (enrolment?.status === "pending") {
      return <div className="mx-auto max-w-4xl p-6">Waiting for enrolment approval...</div>;
    }
    if (enrolment?.status === "rejected") {
      return <div className="mx-auto max-w-4xl p-6">Enrolment rejected.</div>;
    }
    if (enrolment && ["approved", "in_progress", "completed"].includes(enrolment.status)) {
      enrolmentAccess = true;
      enrolmentId = enrolment.id;
      console.log("✅ Access granted via enrolment");
    }
  }

  const finalAccess = hasAssignmentAccess || enrolmentAccess;

  console.log("Final access decision:", {
    hasAssignmentAccess,
    enrolmentAccess,
    finalAccess
  });
  console.log("=== ACCESS CHECK DEBUG END ===");

  // Grant access if either assignment or enrolment allows it
  if (!finalAccess) {
    if (preview) {
      console.log("Preview mode: User not enrolled, but showing preview");
      // Continue with preview
    } else {
      console.log("User not enrolled, showing enrol button");
      // Check if user can enroll (this assumes canUserEnrol exists and is correctly implemented)
      const canEnrol = await canUserEnrol(supabase, user.id, courseId); 
      if (!canEnrol) {
        return (
          <div className="mx-auto max-w-4xl p-6">
            <p>You cannot enrol in this course at this time.</p>
          </div>
        );
      }
      return (
        <div className="mx-auto max-w-4xl p-6">
          <h1 className="text-2xl font-bold mb-4">{course.title}</h1>
          <p className="mb-4 text-gray-600">{course.description}</p>
          <CourseEnrolButton courseId={courseId} />
        </div>
      );
    }
  }

  // If we reach here, the user has access (either via assignment or enrolment)
  // Continue loading course modules and progress, etc.

  // Modules -> sort by global type + per-type order_index
  const modsResp = await supabase
    .from("course_modules")
    .select("id, course_id, type, title, order_index, created_at")
    .eq("course_id", courseId);
  const modulesRaw = (modsResp.data ?? []) as any[];
  const modules = [...modulesRaw].sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(a.type as ModuleType);
    const tb = TYPE_ORDER.indexOf(b.type as ModuleType);
    if (ta !== tb) return ta - tb;
    const oa = (a.order_index ?? 0) as number;
    const ob = (b.order_index ?? 0) as number;
    return oa === ob ? String(a.id).localeCompare(String(b.id)) : oa - ob;
  });

  console.log("Modules query result:", {
    courseId,
    data: modsResp.data,
    error: modsResp.error,
    count: modsResp.data?.length || 0,
    sampleModule: modsResp.data?.[0] || null
  });

  // Progress: done modules - check both assignment and enrollment progress
  let doneRows: any[] = [];

  if (assignmentId) {
    // For assignments, use assignment_progress table
    const { data: assignmentProgress, error: assignmentProgressError } = await supabase
      .from("assignment_progress")
      .select("module_id")
      .eq("assignment_id", assignmentId);

    console.log("Assignment progress check:", {
      assignmentId,
      progressData: assignmentProgress,
      error: assignmentProgressError?.message || null,
      count: assignmentProgress?.length || 0
    });

    if (assignmentProgress) {
      doneRows = assignmentProgress;
    }
  } else if (enrolmentId) {
    // Fallback to enrollment progress
    const { data: enrollmentProgress, error: enrollmentProgressError } = await supabase
      .from("module_progress")
      .select("module_id")
      .eq("enrolment_id", enrolmentId);

    console.log("Enrollment progress check:", {
      enrolmentId,
      progressData: enrollmentProgress,
      error: enrollmentProgressError?.message || null,
      count: enrollmentProgress?.length || 0
    });

    if (enrollmentProgress) {
      doneRows = enrollmentProgress;
    }
  }

  console.log("Final progress calculation:", {
    doneRows,
    doneRowsCount: doneRows?.length || 0,
    totalModules: modules.length,
    assignmentId,
    enrolmentId
  });

  const completedIds = new Set((doneRows ?? []).map((r: any) => r.module_id as string));

  console.log("Completed module IDs:", Array.from(completedIds));
  console.log("All module IDs:", modules.map((m: any) => m.id));


  // Learner documents (for request_document)
  let docsByModule = new Map<string, any[]>();
  if (!preview && (enrolmentId || assignmentId)) { // Check for either enrolment or assignment
    const docsResp = await supabase
      .from("learner_documents")
      .select("id, module_id, display_name, expiry_date, storage_path, status, created_at")
      // Filter by either enrolment_id or assignment_id
      .or(enrolmentId ? `enrolment_id.eq.${enrolmentId}` : "", { foreignTable: "learner_documents" })
      .or(assignmentId ? `assignment_id.eq.${assignmentId}` : "", { foreignTable: "learner_documents" })
      .order("created_at", { ascending: false });

    const docs = (docsResp.data ?? []) as any[];
    for (const d of docs) {
      const arr = docsByModule.get(d.module_id) ?? [];
      arr.push(d);
      docsByModule.set(d.module_id, arr);
    }
  }

  return { user, course, enrolment, assignment, modules, completedIds, docsByModule, preview, error: null as string | null };
}

/** Blocks loader (per module) */
async function loadBlocks(moduleId: string) {
  "use server";
  const supabase = await createSupabaseServer();
  const resp = await supabase
    .from("module_content_blocks")
    .select("id, module_id, kind, data, order_index, created_at")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });

  console.log("Blocks query result:", {
    moduleId,
    data: resp.data,
    error: resp.error,
    count: resp.data?.length || 0,
    sampleBlock: resp.data?.[0] || null
  });
  return (resp.data ?? []) as any[];
}

/** Signed URL helper for private storage (now 1 hour) */
async function signedUrl(path: string | null | undefined) {
  "use server";
  if (!path) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.storage.from("course-files").createSignedUrl(path, 60 * 60); // 1 hour
  return data?.signedUrl ?? null;
}

/** Shared helper for actions */
async function loadModulesByOrder(
  sb: Awaited<ReturnType<typeof createSupabaseServer>>,
  courseId: string
) {
  const { data } = await sb
    .from("course_modules")
    .select("id, type, order_index")
    .eq("course_id", courseId);
  const mods = (data ?? []) as any[];
  return { data: mods.sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(a.type as ModuleType);
    const tb = TYPE_ORDER.indexOf(b.type as ModuleType);
    if (ta !== tb) return ta - tb;
    const oa = (a.order_index ?? 0) as number;
    const ob = (b.order_index ?? 0) as number;
    return oa === ob ? String(a.id).localeCompare(String(b.id)) : oa - ob;
  }) };
}

/** ACTIONS */
async function markComplete(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");

  const courseId = String(formData.get("course_id") || "");
  const moduleId = String(formData.get("module_id") || "");
  const preview = formData.get("preview") === "1";
  const readOnly = formData.get("readOnly") === "true"; // Assuming readOnly is passed similarly

  if (!courseId || !moduleId) throw new Error("missing data");
  if (preview || readOnly) {
    redirect(pageUrl(courseId, { notice: "no_save_preview", preview }));
  }

  // Check if user has assignment
  const { data: assignment } = await supabase
    .from("course_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();

  let progressKey: string;
  let progressTable: string;

  if (assignment) {
    // Use assignment progress
    progressKey = assignment.id;
    progressTable = "assignment_progress";
  } else {
    // Fallback to enrollment
    const { data: enrol } = await supabase
      .from("course_enrolments")
      .select("id")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .maybeSingle();

    // Check legacy enrolments table if current enrolment not found
    let enrolmentId: string | null = enrol?.id || null;
    if (!enrolmentId) {
      const { data: legacyEnrol } = await supabase
        .from("enrolments")
        .select("id")
        .eq("course_id", courseId)
        .eq("user_id", user.id)
        .maybeSingle();
      enrolmentId = legacyEnrol?.id || null;
    }

    if (!enrolmentId) throw new Error("not enrolled");
    progressKey = enrolmentId;
    progressTable = "module_progress";
  }

  // Load modules in correct order
  const { data: mods } = await loadModulesByOrder(supabase, courseId);

  // Gating by order (skip in preview)
  if (!preview) {
    const progressQuery = progressTable === "assignment_progress"
      ? supabase.from("assignment_progress").select("module_id").eq("assignment_id", progressKey)
      : supabase.from("module_progress").select("module_id").eq("enrolment_id", progressKey);

    const { data: doneRows } = await progressQuery;
    const done = new Set((doneRows ?? []).map((r: any) => r.module_id as string));
    const idx = mods.findIndex((m: any) => m.id === moduleId);
    if (idx < 0) throw new Error("Module not found in course");
    if (mods.slice(0, idx).some((m: any) => !done.has(m.id))) throw new Error("Module is locked.");
  }

  // Mark complete (idempotent)
  try {
    if (progressTable === "assignment_progress") {
      const { error: insertError } = await supabase
        .from("assignment_progress")
        .insert({ assignment_id: progressKey, module_id: moduleId });

      if (insertError && !insertError.message?.includes('duplicate')) {
        console.warn("Assignment progress insert error:", insertError);
      }
    } else {
      const { error: insertError } = await supabase
        .from("module_progress")
        .insert({ enrolment_id: progressKey, module_id: moduleId });

      if (insertError && !insertError.message?.includes('duplicate')) {
        console.warn("Module progress insert error:", insertError);
      }
    }
  } catch (e) {
    // Ignore duplicate key errors, which might happen if called multiple times
    console.warn("Ignoring error during module progress insert:", e);
  }

  // Try complete assignment/enrollment
  if (progressTable === "assignment_progress") {
    try { 
      await supabase.rpc("try_complete_assignment", { p_assignment_id: progressKey }); 
    } catch (e) {
      // RPC might not exist yet or might fail, ignore
      console.warn("Ignoring error calling try_complete_assignment:", e);
    }
  } else {
    try { 
      await supabase.rpc("try_complete_enrolment", { p_enrolment_id: progressKey }); 
    } catch (e) {
      // Ignore RPC errors
      console.warn("Ignoring error calling try_complete_enrolment:", e);
    }
  }

  // Next step
  const idx = mods.findIndex((m: any) => m.id === moduleId);
  const nextStep = idx >= 0 ? Math.min(mods.length, idx + 2) : 1;

  revalidatePath(`/app/learn/courses/${courseId}`);
  redirect(pageUrl(courseId, { notice: "saved", step: nextStep, preview }));
}

async function uploadLearnerDocument(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");

  const courseId = String(formData.get("course_id") || "");
  const moduleId = String(formData.get("module_id") || "");
  const display = String(formData.get("display") || "").trim().slice(0, 200) || "Document";
  const expiryStr = String(formData.get("expiry_date") || "").trim() || null;
  const file = formData.get("file") as File | null;
  const preview = formData.get("preview") === "1";

  if (!courseId || !moduleId || !file || file.size === 0) {
    throw new Error("missing data or file");
  }

  // Check if user has assignment
  const { data: assignment } = await supabase
    .from("course_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();

  let progressKey: string | null = null;
  let progressTable: string;

  if (assignment) {
    progressKey = assignment.id;
    progressTable = "assignment_progress";
  } else {
    // Fallback to enrollment
    const { data: enrol } = await supabase
      .from("course_enrolments")
      .select("id")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .maybeSingle();

    let enrolmentId: string | null = enrol?.id || null;
    if (!enrolmentId) {
      const { data: legacyEnrol } = await supabase
        .from("enrolments")
        .select("id")
        .eq("course_id", courseId)
        .eq("user_id", user.id)
        .maybeSingle();
      enrolmentId = legacyEnrol?.id || null;
    }

    progressKey = enrolmentId;
    progressTable = "module_progress";
  }

  if (!preview && !progressKey) {
    throw new Error("not enrolled or assigned");
  }

  if (!preview && user.id) {
    const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".") + 1) : "bin";
    const path = `learner/${user.id}/${crypto.randomUUID()}.${ext}`;
    const ab = await file.arrayBuffer();
    const { error: upErr } = await supabase.storage.from("course-files").upload(path, new Uint8Array(ab), {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (upErr) throw new Error(upErr.message);

    const expiry_date = expiryStr && expiryStr.length ? new Date(expiryStr).toISOString() : null;
    await supabase.from("learner_documents").insert({
      course_id: courseId,
      module_id: moduleId,
      enrolment_id: progressTable === "module_progress" ? progressKey : null,
      assignment_id: progressTable === "assignment_progress" ? progressKey : null,
      user_id: user.id,
      display_name: display,
      storage_path: path,
      expiry_date,
      status: "submitted",
    });
  }

  // Load modules for navigation
  const { data: mods } = await loadModulesByOrder(supabase, courseId);

  // Mark complete & try complete assignment/enrollment
  if (!preview && progressKey) {
    try {
      if (progressTable === "assignment_progress") {
        const { error: insertError } = await supabase
          .from("assignment_progress")
          .insert({ assignment_id: progressKey, module_id: moduleId });

        if (insertError && !insertError.message?.includes('duplicate')) {
          console.warn("Assignment progress insert error during document upload:", insertError);
        }
      } else {
        const { error: insertError } = await supabase
          .from("module_progress")
          .insert({ enrolment_id: progressKey, module_id: moduleId });

        if (insertError && !insertError.message?.includes('duplicate')) {
          console.warn("Module progress insert error during document upload:", insertError);
        }
      }
    } catch (e) {
      // Ignore duplicate key errors
      console.warn("Ignoring error during document upload progress insert:", e);
    }

    // Try complete assignment/enrollment
    if (progressTable === "assignment_progress") {
      try { 
        await supabase.rpc("try_complete_assignment", { p_assignment_id: progressKey }); 
      } catch (e) {
        // RPC might not exist yet, ignore
        console.warn("Ignoring error calling try_complete_assignment for document upload:", e);
      }
    } else {
      try { 
        await supabase.rpc("try_complete_enrolment", { p_enrolment_id: progressKey }); 
      } catch (e) {
        // Ignore RPC errors
        console.warn("Ignoring error calling try_complete_enrolment for document upload:", e);
      }
    }
  }

  // advance
  const idx = mods.findIndex((m: any) => m.id === moduleId);
  const nextStep = idx >= 0 ? Math.min(mods.length, idx + 2) : 1;

  revalidatePath(`/app/learn/courses/${courseId}`);
  redirect(pageUrl(courseId, { notice: "saved", step: nextStep, preview }));
}

/** Dummy function for canUserEnrol (replace with actual logic if needed) */
async function canUserEnrol(supabase: any, userId: string, courseId: string): Promise<boolean> {
  // Placeholder logic: Assume user can enrol if not already enrolled or assigned.
  // In a real app, this would involve more checks.

  // Check current enrolments
  const { data: enrolmentData, error: enrolmentError } = await supabase
    .from("course_enrolments")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (enrolmentData) return false; // Already enrolled

  // Check legacy enrolments
  const { data: legacyEnrolmentData, error: legacyEnrolmentError } = await supabase
    .from("enrolments")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (legacyEnrolmentData) return false; // Already enrolled (legacy)

  // Check assignments
  const { data: assignmentData, error: assignmentError } = await supabase
    .from("course_assignments")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (assignmentData) return false; // Already assigned

  // If none of the above, assume they can enroll
  return true;
}

/** PAGE */
export default async function LearnerCoursePage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const searchParams = await (props.searchParams || Promise.resolve({}));
  const courseId = params.id;
  const sp = searchParams || {};
  const preview = ((Array.isArray(sp.preview) ? sp.preview[0] : sp.preview) ?? "") === "1";

  const data = await loadCourseForLearner(courseId, preview);

  // Handle error cases directly from loadCourseForLearner return
  if (data.error) {
    // Re-check for specific error types for better UI feedback
    if (data.error === "not_enrolled") {
      return (
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="mx-auto max-w-4xl">
            <h1 className="mb-6 text-3xl font-bold">{data.course?.title || "Course"}</h1> {/* Safely access course title */}
            <div className="rounded-lg bg-white p-6 shadow">
              <p className="mb-4">You are not enrolled in this course.</p>
              <CourseEnrolButton courseId={courseId} />
            </div>
          </div>
        </div>
      );
    }

    if (data.error === "pending_approval") {
      return (
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="mx-auto max-w-4xl">
            <h1 className="mb-6 text-3xl font-bold">{data.course?.title || "Course"}</h1>
            <div className="rounded-lg bg-white p-6 shadow">
              <p className="text-yellow-600">
                Your enrolment is pending approval. Please wait for an administrator to approve your request.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (data.error.startsWith("invalid_status:")) {
      const status = data.error.split(":")[1];
      return (
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="mx-auto max-w-4xl">
            <h1 className="mb-6 text-3xl font-bold">{data.course?.title || "Course"}</h1>
            <div className="rounded-lg bg-white p-6 shadow">
              <p className="text-red-600">
                Your enrolment status is: {status}. Please contact an administrator.
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Generic error display
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Course</h1>
        <p className="text-red-600">{data.error}</p>
        <Link href="/app/courses" className="underline">Back</Link>
      </div>
    );
  }

  // Destructure data after confirming no error
  const { course, enrolment, assignment, modules, completedIds, docsByModule } = data;
  const total = modules.length;
  const doneCount = Array.from(completedIds).length;
  const percent = pct(doneCount, total);

  const banner = (Array.isArray(sp.notice) ? sp.notice[0] : sp.notice) === "saved" ? "Saved." : null;

  // Current step
  const stepParam = Number((Array.isArray(sp.step) ? sp.step[0] : sp.step) ?? "1");
  const step = Math.max(1, Math.min(total || 1, isFinite(stepParam) ? stepParam : 1));
  const cur = modules[step - 1] as any;

  // Unlocking
  const unlocked = new Set<string>();
  if (preview) {
    for (const m of modules as any[]) unlocked.add(m.id);
  } else {
    for (let i = 0; i < modules.length; i++) {
      const m = modules[i] as any;
      if (i === 0 || modules.slice(0, i).every((p) => completedIds.has((p as any).id))) {
        unlocked.add(m.id);
      }
    }
  }

  const isUnlocked = unlocked.has(cur.id);
  const isDone = completedIds.has(cur.id);
  // ReadOnly is true if in preview mode OR if the user has completed the course (via assignment)
  const supabase = await createSupabaseServer();
  const assignmentCompleted = assignment ? await isAssignmentCompleted(supabase, assignment.id) : false;
  const readOnly = preview || assignmentCompleted;


  // Prev/Next URLs
  const prevUrl = step > 1 ? pageUrl(courseId, { step: step - 1, preview }) : null;
  const nextUrl = step < total ? pageUrl(courseId, { step: step + 1, preview }) : null;

  const isDigitalTraining = (cur.type as ModuleType) === "digital_training";

  // Decide whether pager should render Next (for digital training we hide it only when the inline button is needed)
  const pagerShouldHideNext =
    isDigitalTraining && !isDone && isUnlocked && !!(enrolment || assignment) && !readOnly;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{course.title ?? "Untitled course"}</h1>
        </div>
        <div className="text-right">
          <Link href="/app/courses" className="rounded-md border px-3 py-1 text-sm">Back to catalogue</Link>
          <div className="mt-2 text-xs text-gray-600">Progress: {doneCount}/{total} ({percent}%)</div>
          <div className="mt-1 h-2 w-48 overflow-hidden rounded-full bg-gray-100 inline-block align-middle">
            <div className="h-2 bg-black" style={{ width: `${percent}%` }} aria-hidden />
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-600">
        Step {step} of {total} • {TYPE_LABEL[cur.type as ModuleType]}{" "}
        {preview && (
          <span className="ml-2 rounded border border-yellow-300 bg-yellow-50 px-1.5 py-0.5 text-yellow-900">
            Preview mode — all steps unlocked; progress isn’t saved.
          </span>
        )}
      </div>

      {banner && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          {banner}
        </div>
      )}

      {assignmentCompleted && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          Course completed — you can still review content below.
        </div>
      )}

      {/* Current step */}
      <section className="rounded-xl border bg-white p-4">
        <header className="mb-3">
          <h2 className="text-lg font-semibold">
            {typeIcon(cur.type as ModuleType)} {cur.title || cur.type.replaceAll("_", " ")}
          </h2>
        </header>

        <ModuleBody
          module={cur}
          isUnlocked={isUnlocked}
          isDone={isDone}
          readOnly={readOnly}
          enrolment={enrolment}
          assignment={assignment} // Pass assignment down
          docsByModule={docsByModule}
          preview={preview}
          step={step}
        />
      </section>

      {/* Pager */}
      <div className="flex items-center justify-between">
        <div>
          {prevUrl ? (
            <Link href={prevUrl} className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">
              ← Previous
            </Link>
          ) : (
            <span className="text-sm text-gray-400">Start</span>
          )}
        </div>

        <div className="text-xs text-gray-500">{TYPE_LABEL[cur.type as ModuleType]}</div>

        <div>
          {pagerShouldHideNext ? (
            <span className="text-sm text-gray-400">&nbsp;</span>
          ) : nextUrl ? (
            <Link href={nextUrl} className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">
              Next →
            </Link>
          ) : (
            <span className="text-sm text-gray-400">&nbsp;</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Module renderer */
async function ModuleBody({
  module,
  isUnlocked,
  isDone,
  readOnly,
  enrolment,
  assignment, // Receive assignment prop
  docsByModule,
  preview,
}: {
  module: any;
  isUnlocked: boolean;
  isDone: boolean;
  readOnly: boolean;
  enrolment: any | null;
  assignment: any | null; // Prop type for assignment
  docsByModule: Map<string, any[]>;
  preview: boolean;
  step: number;
}) {
  "use server";
  const type = module.type as ModuleType;

  // Digital Training: blocks + optional gated "Next"
  if (type === "digital_training") {
    const blocks = await loadBlocks(module.id);

    // Video gating disabled for now
    let gateSeconds = 0;

    // IDs for inline script targets
    const formId = `nextForm_${module.id}`;
    const btnId = `nextBtn_${module.id}`;
    const counterId = `gateCounter_${module.id}`;
    const storageKey = `gate_done_${module.id}`;

    return (
      <div className="space-y-4">
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-600">No content yet.</p>
        ) : (
          blocks.map((b: any) => <BlockView key={b.id} block={{...b, course_id: module.course_id}} />)
        )}

        {isDone && <div className="pt-2 text-sm text-green-700">You completed this step.</div>}

        {/* Show inline Next only when we actually need to mark complete */}
        {isUnlocked && !isDone && (enrolment || assignment) && !readOnly && (
          <div className="pt-2">
            <form id={formId} action={markComplete} className="flex items-center justify-between gap-3">
              <input type="hidden" name="course_id" value={module.course_id} />
              <input type="hidden" name="module_id" value={module.id} />
              {/* Conditionally add enrolment_id or assignment_id */}
              {enrolment && <input type="hidden" name="enrolment_id" value={enrolment.id} />}
              {assignment && <input type="hidden" name="assignment_id" value={assignment.id} />}
              <input type="hidden" name="preview" value={preview ? "1" : ""} />

              <div id={counterId} className="text-sm text-gray-600" style={{ display: gateSeconds > 0 ? "block" : "none" }}>
                ⏳ Please watch the video — Next unlocks in <span id={`${counterId}_time`}>{String(Math.floor(gateSeconds / 60)).padStart(2, '0')}:{String(gateSeconds % 60).padStart(2, '0')}</span>.
              </div>

              <button
                id={btnId}
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={gateSeconds > 0}
              >
                Next →
              </button>
            </form>

            {/* Client-side progress tracking for assignments */}
            {assignment && (
              <script
                dangerouslySetInnerHTML={{
                  __html: `
(function(){
  try {
    const assignmentId = ${JSON.stringify(assignment.id)};
    const moduleId = ${JSON.stringify(module.id)};
    const moduleType = ${JSON.stringify(module.type)};
    
    console.log("🔍 Assignment progress tracking initialized:", {
      assignmentId,
      moduleId,
      moduleType,
      formId: ${JSON.stringify(formId)}
    });

    // For digital training modules, track progress when form is submitted
    const form = document.getElementById(${JSON.stringify(formId)});
    if (form && moduleType === "digital_training") {
      form.addEventListener('submit', function(e) {
        console.log("📤 Form submitted - sending assignment progress...");
        
        // Send progress tracking request (fire and forget)
        fetch("/api/assignment/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignmentId: assignmentId,
            moduleId: moduleId,
          }),
        })
        .then(response => {
          console.log("📥 Assignment progress API response status:", response.status);
          return response.json();
        })
        .then(data => {
          console.log("📥 Assignment progress API response:", data);
          if (data.ok) {
            console.log("✅ Assignment progress saved successfully");
          } else {
            console.error("❌ Assignment progress failed:", data.error);
          }
        })
        .catch(error => {
          console.error("❌ Assignment progress request failed:", error);
        });
      });
    }
  } catch(e) {
    console.error("Assignment progress tracking error:", e);
  }
})();`,
                }}
              />
            )}
          </div>
        )}

            {gateSeconds > 0 && (
              <script
                dangerouslySetInnerHTML={{
                  __html: `
(function(){
  try{
    var KEY = ${JSON.stringify(storageKey)};
    var done = false;
    try { done = localStorage.getItem(KEY) === '1'; } catch(e){}
    var btn = document.getElementById(${JSON.stringify(btnId)});
    var ctr = document.getElementById(${JSON.stringify(counterId)});
    if(!btn){ return; }
    if(done){
      btn.disabled = false;
      if(ctr) ctr.style.display='none';
      return;
    }
    var target = ${gateSeconds};
    var remaining = target;
    var lastTime = Date.now();
    var timeSpan = document.getElementById(${JSON.stringify(`${counterId}_time`)});
    function fmt(total){ var m=Math.floor(total/60), s=total%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
    function updateDisplay(){
      if(timeSpan){ timeSpan.textContent = fmt(remaining); }
    }
    function tick(){
      if(document.hidden){ return setTimeout(tick, 1000); }
      var now = Date.now();
      var delta = Math.floor((now - lastTime) / 1000);
      if(delta >= 1){
        remaining = Math.max(0, remaining - delta);
        lastTime = now;
        updateDisplay();
        if(remaining <= 0){
          btn.disabled = false;
          if(ctr) ctr.style.display='none';
          try { localStorage.setItem(KEY, '1'); } catch(e){}
          return;
        }
      }
      setTimeout(tick, 1000);
    }
    tick();
  }catch(e){}
})();`,
                }}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // Request Document
  if (type === "request_document") {
    const reqBlocks = await loadBlocks(module.id);
    const cfg = reqBlocks.find((b: any) => b.kind === "request_document")?.data ?? {};
    const wantExpiry = !!cfg.require_expiry;
    const prompt = cfg.label || "Please upload the requested document.";

    const existing = docsByModule.get(module.id) ?? [];

    return (
      <div className="space-y-3">
        <p className="text-sm">{prompt}</p>

        {existing.length > 0 && (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-3 py-2 text-left">File</th>
                  <th className="px-3 py-2 text-left">Expiry</th>
                  <th className="px-3 py-2 text-left">Added</th>
                  <th className="px-3 py-2 text-left">Link</th>
                </tr>
              </thead>
              <tbody>
                {await Promise.all(
                  existing.map(async (d) => {
                    const url = await signedUrl(d.storage_path); // 1 hour
                    return (
                      <tr key={d.id} className="border-b">
                        <td className="px-3 py-2">{d.display_name ?? "Document"}</td>
                        <td className="px-3 py-2">
                          {d.expiry_date ? new Date(d.expiry_date).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-3 py-2">{new Date(d.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          {url ? <a className="underline" href={url} target="_blank">View</a> : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {isDone && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            A document has been uploaded for this step.
          </div>
        )}

        <form action={uploadLearnerDocument} className="flex flex-wrap items-end gap-3 pt-1">
          <input type="hidden" name="course_id" value={module.course_id} />
          <input type="hidden" name="module_id" value={module.id} />
          {/* Conditionally add enrolment_id or assignment_id */}
          {enrolment && <input type="hidden" name="enrolment_id" value={enrolment.id} />}
          {assignment && <input type="hidden" name="assignment_id" value={assignment.id} />}
          <input type="hidden" name="preview" value={preview ? "1" : ""} />

          <div>
            <label className="mb-1 block text-xs text-gray-600">Display name</label>
            <input
              name="display"
              defaultValue={cfg.label ?? ""}
              className="w-64 rounded-md border px-3 py-2 text-sm"
              placeholder="e.g., Driver licence"
              disabled={!isUnlocked || readOnly || !(enrolment || assignment)}
            />
          </div>

          {wantExpiry && (
            <div>
              <label className="mb-1 block text-xs text-gray-600">Expiry date</label>
              <input type="date" name="expiry_date" className="rounded-md border px-3 py-2 text-sm" disabled={!isUnlocked || readOnly || !(enrolment || assignment)} />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-gray-600">File</label>
            <input type="file" name="file" required className="block w-64 text-sm" disabled={!isUnlocked || readOnly || !(enrolment || assignment)} />
          </div>

          <div className="pb-2">
            <button className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!isUnlocked || readOnly || !(enrolment || assignment)}>
              Upload & save
            </button>
          </div>
        </form>

        {(!isUnlocked || readOnly) && (
          <p className="text-xs text-gray-500">
            {readOnly ? "Preview mode — actions disabled." : "This step is locked until you complete previous steps."}
          </p>
        )}
      </div>
    );
  }

  if (type === "digital_assessment_quiz") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-700">
          This step is a quiz. Starting the quiz will open it in a dedicated view.
        </p>
        <div>
          <Link
            href={`/app/learn/quiz/${module.id}${preview ? "?preview=1" : ""}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            aria-disabled={!isUnlocked || readOnly}
          >
            Start quiz
          </Link>
        </div>
        {!isUnlocked && <p className="text-xs text-gray-500">Locked until previous steps are complete.</p>}
        {readOnly && <p className="text-xs text-gray-500">Preview mode — actions disabled.</p>}
        
        {/* Auto-track progress for quiz modules when viewed */}
        {assignment && isUnlocked && !preview && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
(function(){
  try {
    const assignmentId = ${JSON.stringify(assignment.id)};
    const moduleId = ${JSON.stringify(module.id)};
    
    console.log("🎯 Auto-tracking quiz module progress:", { assignmentId, moduleId });
    
    fetch("/api/assignment/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId: assignmentId,
        moduleId: moduleId,
      }),
    })
    .then(response => response.json())
    .then(data => console.log("Quiz progress tracked:", data))
    .catch(error => console.error("Quiz progress tracking failed:", error));
  } catch(e) {
    console.error("Quiz progress tracking error:", e);
  }
})();`,
            }}
          />
        )}
      </div>
    );
  }

  if (type === "onsite_training" || type === "onsite_assessment") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-700">
          This step is recorded by your {type === "onsite_training" ? "trainer" : "assessor"} during an in-person session.
        </p>
        {!isUnlocked && <p className="text-xs text-gray-500">Locked until previous steps are complete.</p>}
        
        {/* Auto-track progress for onsite modules when viewed */}
        {assignment && isUnlocked && !preview && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
(function(){
  try {
    const assignmentId = ${JSON.stringify(assignment.id)};
    const moduleId = ${JSON.stringify(module.id)};
    const moduleType = ${JSON.stringify(type)};
    
    console.log("🎯 Auto-tracking onsite module progress:", { assignmentId, moduleId, moduleType });
    
    fetch("/api/assignment/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId: assignmentId,
        moduleId: moduleId,
      }),
    })
    .then(response => response.json())
    .then(data => console.log("Onsite progress tracked:", data))
    .catch(error => console.error("Onsite progress tracking failed:", error));
  } catch(e) {
    console.error("Onsite progress tracking error:", e);
  }
})();`,
            }}
          />
        )}
      </div>
    );
  }

  return <p className="text-sm text-gray-600">Unsupported module type.</p>;
}

// Helper to check if an assignment is completed
async function isAssignmentCompleted(supabase: any, assignmentId: string): Promise<boolean> {
  try {
    // Get the assignment and course info
    const { data: assignmentData } = await supabase
      .from("course_assignments")
      .select("course_id")
      .eq("id", assignmentId)
      .single();

    if (!assignmentData) return false;

    // Get all modules for this course
    const { data: modules } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", assignmentData.course_id);

    if (!modules || modules.length === 0) return false;

    // Get completed modules for this assignment
    const { data: completedModules } = await supabase
      .from("assignment_progress")
      .select("module_id")
      .eq("assignment_id", assignmentId);

    if (!completedModules) return false;

    // Check if all modules are completed
    return completedModules.length === modules.length;

  } catch (error) {
    console.error("Error checking assignment completion status:", error);
    return false;
  }
}


/** Content block viewer */
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[c];
  });
}

/** Accept full <iframe ...> snippets by extracting their src */
function extractIframeSrc(raw: string) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("<")) {
    const m = trimmed.match(/\ssrc=(?:"|')([^"']+)(?:"|')/i);
    if (m && m[1]) return m[1];
  }
  return trimmed;
}

function toEmbedUrl(raw: string, courseId?: string) {
  const input = extractIframeSrc(raw);
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, "");

    // YouTube
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        if (v) return `https://www.youtube.com/embed/${v}`;
      }
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2];
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }

    // Vimeo
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }

    // SharePoint/OneDrive embed page - add authentication handling
    if (host.endsWith(".sharepoint.com") && u.pathname.includes("/_layouts/15/embed.aspx")) {
      // Add course context for session management
      if (courseId) {
        const authUrl = new URL(input);
        authUrl.searchParams.set('courseContext', courseId);
        return authUrl.toString();
      }
      return input;
    }

    return input;
  } catch {
    return input;
  }
}

function isImageLike(nameOrPath: string | null | undefined) {
  if (!nameOrPath) return false;
  const n = nameOrPath.toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"].some((ext) => n.endsWith(ext));
}

/** Block renderer used by Digital Training */
async function BlockView({ block }: { block: any }) {
  "use server";
  const kind = block.kind as BlockKind;
  const data = (block.data || {}) as any;

  if (kind === "rich_text") {
    const text = String(data.text ?? "");
    return <div className="prose max-w-none whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: escapeHtml(text) }} />;
  }

  if (kind === "link") {
    const url = String(data.url ?? "");
    const label = String((data.label ?? url) || "Link");
    return (
      <p className="text-sm">
        🔗 <a href={url} target="_blank" className="underline break-all">{label}</a>
      </p>
    );
  }

  if (kind === "video_embed") {
    const url = toEmbedUrl(data?.url ?? "", block.course_id);

    return url ? (
      <VideoPlayer 
                    videoUrl={url} 
                    courseId={block.course_id}
                  />
    ) : (
      <p className="text-sm text-gray-500">No video URL provided.</p>
    );
  }

  if (kind === "file") {
    // Prefer a fresh signed URL whenever we have a storage path.
    const display = String(data.filename ?? data.display ?? "Download");
    const path: string | null = data.file_id ?? data.storage_path ?? null;

    let url: string | null = null;
    if (path) {
      url = await signedUrl(path); // fresh (1h)
    } else if (data.public_url) {
      url = String(data.public_url);
    } else if (data.signed_url) {
      // Last resort (may be stale)
      url = String(data.signed_url);
    }

    if (!url) return <p className="text-sm text-gray-500">File not available.</p>;

    const looksImage = isImageLike(display) || isImageLike(path);
    if (looksImage) {
      return (
        <figure className="rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={display} className="w-full h-auto" />
          <figcaption className="px-3 py-2 text-xs text-gray-600 break-all">{display}</figcaption>
        </figure>
      );
    }

    return (
      <p className="text-sm">
        ⬇️ <a href={url} target="_blank" className="underline break-all" download>{display}</a>
      </p>
    );
  }

  // request_document is handled in ModuleBody
  return null;
}

async function CourseEnrolButton({ courseId }: { courseId: string }) {
  return (
    <form action="/app/courses/enrol" method="post">
      <input type="hidden" name="course_id" value={courseId} />
      <button className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800">
        Request Enrolment
      </button>
    </form>
  );
}

// Mock markModuleComplete for ModuleBody if it's not defined outside
// This is a placeholder and should be replaced by the actual markComplete function
// if it's intended to be used within ModuleBody's scope and not globally.
// However, based on the original code, markComplete is defined globally.
// If ModuleBody requires it and it's not in scope, this comment highlights a potential issue.

// Mock for markModuleComplete if it's needed within ModuleBody but defined outside
// This is usually handled by the server component rendering context.
// If the original `markComplete` action is correctly imported or available in scope,
// no mock is needed. Let's assume it's globally available in the server component context.
// async function markComplete(formData: FormData) { ... } // Assuming this is globally defined