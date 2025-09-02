
// app/app/learn/courses/[id]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import CoursePreview from "@/components/CoursePreview";

/**
 * Renders a course as a learner (assignments-only approach).
 * Requires a trainee assignment for the signed-in user.
 */
type RouteParams = { id: string };

type ModuleType =
  | "digital_training"
  | "digital_assessment_quiz"
  | "onsite_training"
  | "onsite_assessment";

type BlockKind = "rich_text" | "link" | "video_embed" | "file" | "request_document";

const TYPE_ORDER: ModuleType[] = [
  "digital_training",
  "digital_assessment_quiz",
  "onsite_training",
  "onsite_assessment",
];

const TYPE_LABEL: Record<ModuleType, string> = {
  digital_training: "Digital Training",
  digital_assessment_quiz: "Digital Quiz",
  onsite_training: "Onsite Training",
  onsite_assessment: "Onsite Assessment",
};

function typeIcon(t: ModuleType) {
  switch (t) {
    case "digital_training": return "📖";
    case "digital_assessment_quiz": return "📝";
    case "onsite_training": return "👥";
    case "onsite_assessment": return "✅";
    default: return "•";
  }
}

// Normalize common share/watch links to proper embed URLs
function toEmbedUrl(raw: string) {
  try {
    const u = new URL(raw);
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
    return raw;
  } catch {
    return raw;
  }
}

function fileProxy(path: string) {
  return `/app/files/${encodeURIComponent(path)}`;
}

function isImagePath(p: string) {
  const ext = p.split(".").pop()?.toLowerCase();
  return !!ext && ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

async function BlockView({ block }: { block: any }) {
  "use server";
  const kind = block.kind as BlockKind;
  const data = (block.data || {}) as any;

  if (kind === "rich_text") {
    const text = String(data.text ?? "");
    return (
      <div
        className="prose max-w-none whitespace-pre-wrap text-sm"
        dangerouslySetInnerHTML={{ __html: escapeHtml(text) }}
      />
    );
  }

  if (kind === "link") {
    const url = String(data.url ?? "");
    const label = String((data.label ?? url) || "Link");
    return (
      <p className="text-sm">
        🔗{" "}
        <a href={url} target="_blank" className="underline break-all">
          {label}
        </a>
      </p>
    );
  }

  if (kind === "video_embed") {
    const raw = String(data.url ?? "");
    const url = toEmbedUrl(raw);
    return url ? (
      <div className="aspect-video w-full overflow-hidden rounded-md border">
        <iframe
          src={url}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    ) : (
      <p className="text-sm text-gray-500">No video URL provided.</p>
    );
  }

  if (kind === "file") {
    const display = String(data.filename ?? data.display ?? "Download");
    const path: string | null = data.file_id ?? data.storage_path ?? null;

    if (!path) {
      return <p className="text-sm text-gray-500">File not available.</p>;
    }

    const href = fileProxy(path);

    if (isImagePath(path)) {
      return (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={display}
            className="max-h-[480px] w-auto rounded-md border object-contain"
          />
          <figcaption className="text-xs text-gray-500">
            {display} •{" "}
            <a href={href} target="_blank" className="underline">
              open in new tab
            </a>
          </figcaption>
        </figure>
      );
    }

    return (
      <p className="text-sm">
        ⬇️{" "}
        <a href={href} target="_blank" className="underline break-all">
          {display}
        </a>
      </p>
    );
  }

  if (kind === "request_document") {
    const prompt = String(data.label ?? "Please upload the requested document in the course view.");
    return <p className="text-sm text-gray-700">{prompt}</p>;
  }

  return null;
}

async function loadBlocks(moduleId: string) {
  "use server";
  const supabase = await createSupabaseServer();
  const resp = await supabase
    .from("module_content_blocks")
    .select("id, module_id, kind, data, order_index, created_at")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  return resp.data ?? [];
}

export default async function LearnerCoursePage(props: { params: Promise<RouteParams> }) {
  const { id: courseId } = await props.params;
  const supabase = await createSupabaseServer();

  // Require auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) redirect("/auth/login");

  // Must have a trainee assignment for this course
  const { data: assignment, error: assignmentErr } = await supabase
    .from("course_assignments")
    .select("id, role, assignment_status")
    .eq("course_id", courseId)
    .eq("user_id", user.id)
    .eq("role", "trainee")
    .single();

  if (assignmentErr || !assignment) {
    console.error("No trainee assignment", assignmentErr);
    redirect("/app/learn?error=not_assigned");
  }

  // Load course
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, description, status")
    .eq("id", courseId)
    .single();
  if (courseErr || !course) {
    console.error("Course load error", courseErr);
    notFound();
  }

  // Load modules + blocks
  const { data: modules, error: modErr } = await supabase
    .from("course_modules")
    .select("id, course_id, title, type, order_index, stage")
    .eq("course_id", course.id)
    .order("order_index", { ascending: true });
  if (modErr) {
    console.error("Modules load error", modErr);
    notFound();
  }

  // Sort modules by type order then by order_index
  const sortedModules = (modules ?? []).sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(a.type as ModuleType);
    const tb = TYPE_ORDER.indexOf(b.type as ModuleType);
    if (ta !== tb) return ta - tb;
    return (a.order_index ?? 0) - (b.order_index ?? 0);
  });

  // Load all blocks for all modules
  const moduleIds = sortedModules.map((m) => m.id);
  const { data: blocks, error: blockErr } = moduleIds.length
    ? await supabase
        .from("module_content_blocks")
        .select("id, module_id, kind, data, order_index")
        .in("module_id", moduleIds)
        .order("order_index", { ascending: true })
    : { data: [], error: null as any };
  if (blockErr) {
    console.error("Blocks load error", blockErr);
    notFound();
  }

  // Load assignment progress
  const { data: assignmentProgress } = await supabase
    .from("assignment_progress")
    .select("module_id, completed_at")
    .eq("assignment_id", assignment.id);

  const completedModules = new Set((assignmentProgress ?? []).map(p => p.module_id));
  const totalModules = sortedModules.length;
  const completedCount = completedModules.size;
  const progressPercent = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

  return (
    <div className="flex h-screen">
      {/* Left Sidebar */}
      <div className="w-80 border-r bg-gray-50 flex flex-col">
        {/* Course Header */}
        <div className="p-4 border-b bg-white">
          <Link href="/app/learn" className="text-sm text-blue-600 hover:underline mb-2 block">
            ← Back to courses
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">
            {course.title}
          </h1>
          <div className="text-sm text-gray-600 mb-3">
            {completedCount} / {totalModules} modules complete
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Module List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {sortedModules.map((module, index) => {
              const isCompleted = completedModules.has(module.id);
              const isUnlocked = index === 0 || sortedModules.slice(0, index).every(m => completedModules.has(m.id));
              
              return (
                <div
                  key={module.id}
                  className={`
                    p-3 rounded-lg border text-sm cursor-pointer transition-all
                    ${isCompleted 
                      ? 'bg-green-50 border-green-200 text-green-800' 
                      : isUnlocked 
                        ? 'bg-white border-gray-200 hover:bg-gray-50' 
                        : 'bg-gray-100 border-gray-200 text-gray-500'
                    }
                  `}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5">
                      {isCompleted ? '✅' : typeIcon(module.type as ModuleType)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {module.title || TYPE_LABEL[module.type as ModuleType]}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {TYPE_LABEL[module.type as ModuleType]}
                      </div>
                      {!isUnlocked && (
                        <div className="text-xs text-gray-400 mt-1">
                          🔒 Complete previous modules to unlock
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <div className="p-4 border-b bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Learning Progress</h2>
              <p className="text-sm text-gray-600 mt-1">
                Complete modules in order to progress through the course
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">{progressPercent}%</div>
              <div className="text-xs text-gray-500">Complete</div>
            </div>
          </div>
        </div>

        {/* Course Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="space-y-6">
              {sortedModules.map((module, index) => {
                const isCompleted = completedModules.has(module.id);
                const isUnlocked = index === 0 || sortedModules.slice(0, index).every(m => completedModules.has(m.id));
                const moduleBlocks = (blocks ?? []).filter(b => b.module_id === module.id);

                return (
                  <div
                    key={module.id}
                    className={`
                      rounded-xl border p-6 transition-all
                      ${isCompleted 
                        ? 'bg-green-50 border-green-200' 
                        : isUnlocked 
                          ? 'bg-white border-gray-200 shadow-sm' 
                          : 'bg-gray-50 border-gray-200 opacity-60'
                      }
                    `}
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <span className="text-2xl">
                        {isCompleted ? '✅' : typeIcon(module.type as ModuleType)}
                      </span>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          {module.title || TYPE_LABEL[module.type as ModuleType]}
                          {isCompleted && (
                            <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded-full">
                              Complete
                            </span>
                          )}
                          {!isUnlocked && (
                            <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                              🔒 Locked
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {TYPE_LABEL[module.type as ModuleType]}
                        </p>
                      </div>
                    </div>

                    {/* Module Content */}
                    {isUnlocked ? (
                      <div className="space-y-4">
                        {moduleBlocks.length === 0 ? (
                          <p className="text-sm text-gray-600">No content available.</p>
                        ) : (
                          moduleBlocks.map((block) => (
                            <BlockView key={block.id} block={block} />
                          ))
                        )}

                        {/* Module Actions */}
                        {module.type === "digital_assessment_quiz" && (
                          <div className="pt-4">
                            <Link
                              href={`/app/learn/quiz/${courseId}?module=${module.id}`}
                              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              Start Quiz
                            </Link>
                          </div>
                        )}

                        {module.type === "digital_training" && !isCompleted && (
                          <div className="pt-4">
                            <form action={async () => {
                              "use server";
                              const supabase = await createSupabaseServer();
                              await supabase
                                .from("assignment_progress")
                                .insert({
                                  assignment_id: assignment.id,
                                  module_id: module.id,
                                  completed_at: new Date().toISOString(),
                                })
                                .select()
                                .single();
                              redirect(`/app/learn/courses/${courseId}`);
                            }}>
                              <button className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                                Mark as Complete
                              </button>
                            </form>
                          </div>
                        )}

                        {(module.type === "onsite_training" || module.type === "onsite_assessment") && (
                          <div className="pt-4">
                            <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                              This step will be completed by your {module.type === "onsite_training" ? "trainer" : "assessor"} during an in-person session.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 bg-gray-100 p-4 rounded-lg">
                        Complete the previous modules to unlock this content.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
