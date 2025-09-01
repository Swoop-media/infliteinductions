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

  let assignment: any = null;

  // Check access via assignment
  if (user) {
    const { data: assignmentData } = await supabase
      .from("course_assignments")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .maybeSingle();

    if (assignmentData) {
      assignment = assignmentData;
    } else if (!preview) {
      return (
        <div className="mx-auto max-w-4xl p-6">
          <h1 className="text-2xl font-bold mb-4">{course.title}</h1>
          <p className="mb-4 text-gray-600">You do not have access to this course. Contact an administrator if you believe this is an error.</p>
          <Link href="/app/courses" className="underline">Back to courses</Link>
        </div>
      );
    }
  }

  // Load modules
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

  // Progress: done modules - assignment progress only
  let doneRows: any[] = [];
  if (assignment) {
    const { data: assignmentProgress } = await supabase
      .from("assignment_progress")
      .select("module_id")
      .eq("assignment_id", assignment.id);

    if (assignmentProgress) {
      doneRows = assignmentProgress;
    }
  }

  const completedIds = new Set((doneRows ?? []).map((r: any) => r.module_id as string));

  // Learner documents (for request_document)
  let docsByModule = new Map<string, any[]>();
  if (!preview && assignment) {
    const docsResp = await supabase
      .from("learner_documents")
      .select("id, module_id, display_name, expiry_date, storage_path, status, created_at")
      .eq("assignment_id", assignment.id)
      .order("created_at", { ascending: false });

    const docs = (docsResp.data ?? []) as any[];
    for (const d of docs) {
      const arr = docsByModule.get(d.module_id) ?? [];
      arr.push(d);
      docsByModule.set(d.module_id, arr);
    }
  }

  return { user, course, assignment, modules, completedIds, docsByModule, preview, error: null as string | null };
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

  return (resp.data ?? []) as any[];
}

/** Signed URL helper for private storage */
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

  if (!courseId || !moduleId) throw new Error("missing data");
  if (preview) {
    redirect(pageUrl(courseId, { notice: "no_save_preview", preview }));
  }

  // Check if user has assignment
  const { data: assignment } = await supabase
    .from("course_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!assignment) throw new Error("not assigned");

  // Load modules in correct order
  const { data: mods } = await loadModulesByOrder(supabase, courseId);

  // Gating by order
  const { data: doneRows } = await supabase
    .from("assignment_progress")
    .select("module_id")
    .eq("assignment_id", assignment.id);

  const done = new Set((doneRows ?? []).map((r: any) => r.module_id as string));
  const idx = mods.findIndex((m: any) => m.id === moduleId);
  if (idx < 0) throw new Error("Module not found in course");
  if (mods.slice(0, idx).some((m: any) => !done.has(m.id))) throw new Error("Module is locked.");

  // Mark complete (idempotent)
  try {
    const { error: insertError } = await supabase
      .from("assignment_progress")
      .insert({ assignment_id: assignment.id, module_id: moduleId });

    if (insertError && !insertError.message?.includes('duplicate')) {
      console.warn("Assignment progress insert error:", insertError);
    }
  } catch (e) {
    console.warn("Ignoring error during module progress insert:", e);
  }

  // Try complete assignment
  try { 
    await supabase.rpc("try_complete_assignment", { p_assignment_id: assignment.id }); 
  } catch (e) {
    console.warn("Ignoring error calling try_complete_assignment:", e);
  }

  // Next step
  const idx_next = mods.findIndex((m: any) => m.id === moduleId);
  const nextStep = idx_next >= 0 ? Math.min(mods.length, idx_next + 2) : 1;

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

  if (!preview && !assignment) {
    throw new Error("not assigned");
  }

  if (!preview && user.id && assignment) {
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
      assignment_id: assignment.id,
      user_id: user.id,
      display_name: display,
      storage_path: path,
      expiry_date,
      status: "submitted",
    });

    // Mark complete
    try {
      await supabase
        .from("assignment_progress")
        .insert({ assignment_id: assignment.id, module_id: moduleId });
    } catch (e) {
      console.warn("Ignoring error during document upload progress insert:", e);
    }

    // Try complete assignment
    try { 
      await supabase.rpc("try_complete_assignment", { p_assignment_id: assignment.id }); 
    } catch (e) {
      console.warn("Ignoring error calling try_complete_assignment for document upload:", e);
    }
  }

  // Load modules for navigation
  const { data: mods } = await loadModulesByOrder(supabase, courseId);

  // advance
  const idx = mods.findIndex((m: any) => m.id === moduleId);
  const nextStep = idx >= 0 ? Math.min(mods.length, idx + 2) : 1;

  revalidatePath(`/app/learn/courses/${courseId}`);
  redirect(pageUrl(courseId, { notice: "saved", step: nextStep, preview }));
}

/** Helper to check if an assignment is completed */
async function isAssignmentCompleted(supabase: any, assignmentId: string): Promise<boolean> {
  try {
    const { data: assignmentData } = await supabase
      .from("course_assignments")
      .select("course_id")
      .eq("id", assignmentId)
      .single();

    if (!assignmentData) return false;

    const { data: modules } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", assignmentData.course_id);

    if (!modules || modules.length === 0) return false;

    const { data: completedModules } = await supabase
      .from("assignment_progress")
      .select("module_id")
      .eq("assignment_id", assignmentId);

    if (!completedModules) return false;

    return completedModules.length === modules.length;
  } catch (error) {
    console.error("Error checking assignment completion status:", error);
    return false;
  }
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

  // Handle error cases
  if (data.error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Course</h1>
        <p className="text-red-600">{data.error}</p>
        <Link href="/app/courses" className="underline">Back</Link>
      </div>
    );
  }

  // Check if data is a JSX element (access denied case)
  if (React.isValidElement(data)) {
    return data;
  }

  // Destructure data after confirming no error
  const { course, assignment, modules, completedIds, docsByModule } = data;
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

  // Check if assignment is completed
  const supabase = await createSupabaseServer();
  const assignmentCompleted = assignment ? await isAssignmentCompleted(supabase, assignment.id) : false;
  const readOnly = preview || assignmentCompleted;

  // Prev/Next URLs
  const prevUrl = step > 1 ? pageUrl(courseId, { step: step - 1, preview }) : null;
  const nextUrl = step < total ? pageUrl(courseId, { step: step + 1, preview }) : null;

  const isDigitalTraining = (cur.type as ModuleType) === "digital_training";
  const pagerShouldHideNext = isDigitalTraining && !isDone && isUnlocked && !!assignment && !readOnly;

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
            Preview mode — all steps unlocked; progress isn't saved.
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
          assignment={assignment}
          docsByModule={docsByModule}
          preview={preview}
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
  assignment,
  docsByModule,
  preview,
}: {
  module: any;
  isUnlocked: boolean;
  isDone: boolean;
  readOnly: boolean;
  assignment: any | null;
  docsByModule: Map<string, any[]>;
  preview: boolean;
}) {
  "use server";
  const type = module.type as ModuleType;

  // Digital Training: blocks + optional gated "Next"
  if (type === "digital_training") {
    const blocks = await loadBlocks(module.id);

    return (
      <div className="space-y-4">
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-600">No content yet.</p>
        ) : (
          blocks.map((b: any) => <BlockView key={b.id} block={{...b, course_id: module.course_id}} />)
        )}

        {isDone && <div className="pt-2 text-sm text-green-700">You completed this step.</div>}

        {/* Show inline Next only when we actually need to mark complete */}
        {isUnlocked && !isDone && assignment && !readOnly && (
          <div className="pt-2">
            <form action={markComplete} className="flex items-center justify-between gap-3">
              <input type="hidden" name="course_id" value={module.course_id} />
              <input type="hidden" name="module_id" value={module.id} />
              <input type="hidden" name="preview" value={preview ? "1" : ""} />

              <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">
                Next →
              </button>
            </form>
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
                    const url = await signedUrl(d.storage_path);
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
          <input type="hidden" name="preview" value={preview ? "1" : ""} />

          <div>
            <label className="mb-1 block text-xs text-gray-600">Display name</label>
            <input
              name="display"
              defaultValue={cfg.label ?? ""}
              className="w-64 rounded-md border px-3 py-2 text-sm"
              placeholder="e.g., Driver licence"
              disabled={!isUnlocked || readOnly || !assignment}
            />
          </div>

          {wantExpiry && (
            <div>
              <label className="mb-1 block text-xs text-gray-600">Expiry date</label>
              <input type="date" name="expiry_date" className="rounded-md border px-3 py-2 text-sm" disabled={!isUnlocked || readOnly || !assignment} />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-gray-600">File</label>
            <input type="file" name="file" required className="block w-64 text-sm" disabled={!isUnlocked || readOnly || !assignment} />
          </div>

          <div className="pb-2">
            <button className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!isUnlocked || readOnly || !assignment}>
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
          >
            Start quiz
          </Link>
        </div>
        {!isUnlocked && <p className="text-xs text-gray-500">Locked until previous steps are complete.</p>}
        {readOnly && <p className="text-xs text-gray-500">Preview mode — actions disabled.</p>}
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
      </div>
    );
  }

  return <p className="text-sm text-gray-600">Unsupported module type.</p>;
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

    // SharePoint/OneDrive embed page
    if (host.endsWith(".sharepoint.com") && u.pathname.includes("/_layouts/15/embed.aspx")) {
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
    const display = String(data.filename ?? data.display ?? "Download");
    const path: string | null = data.file_id ?? data.storage_path ?? null;

    let url: string | null = null;
    if (path) {
      url = await signedUrl(path);
    } else if (data.public_url) {
      url = String(data.public_url);
    } else if (data.signed_url) {
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

  return null;
}