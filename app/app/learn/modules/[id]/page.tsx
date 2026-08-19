// @ts-nocheck
// app/app/learn/modules/[id]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import UnifiedVideoPlayer from '@/components/UnifiedVideoPlayer';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import QuizQuestionsBlock from './QuizQuestionsBlock';
import EquipmentFormBlock from '@/components/EquipmentFormBlock';

export const dynamic = "force-dynamic";

type BlockKind = "rich_text" | "link" | "video_embed" | "file" | "request_document" | "equipment_form";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Normalize common share/watch links to proper embed URLs (prevents 404 in iframes)
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

/** Build proxy URL for private storage */
function fileProxy(path: string) {
  return `/app/files/${encodeURIComponent(path)}`;
}

function isImagePath(p: string) {
  const ext = p.split(".").pop()?.toLowerCase();
  return !!ext && ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext);
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
    return raw ? (
      <UnifiedVideoPlayer videoUrl={raw} title={data.title || "Course Video"} />
    ) : data.pending_format_fix ? (
      <p className="text-sm text-gray-600">⏳ This video is being processed and will be available shortly. Please check back in a few minutes.</p>
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
    const isPDF = path.toLowerCase().endsWith('.pdf');

    // If it looks like an image, render inline + a small "open" link.
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

    // If it's a PDF, render inline viewer
    if (isPDF) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-t-md border">
            <span className="text-sm font-medium text-gray-900">{display}</span>
            <a href={href} target="_blank" className="text-sm text-blue-600 hover:underline">
              Open in new tab
            </a>
          </div>
          <div className="border rounded-b-md bg-white">
            <iframe
              src={`${href}#toolbar=1&navpanes=1&scrollbar=1`}
              className="w-full h-[800px] rounded-b-md"
              title={display}
            />
          </div>
        </div>
      );
    }

    // Otherwise, present a download/open link
    return (
      <p className="text-sm">
        ⬇️{" "}
        <a href={href} target="_blank" className="underline break-all">
          {display}
        </a>
      </p>
    );
  }

  // request_document config is just informational here (uploads happen in course view)
  if (kind === "request_document") {
    const prompt = String(data.label ?? "Please upload the requested document in the course view.");
    return <p className="text-sm text-gray-700">{prompt}</p>;
  }

  if (kind === "equipment_form") {
    return (
      <div className="rounded-md border border-orange-200 bg-orange-50 p-4">
        <h4 className="mb-2 font-medium text-orange-900">🔧 Equipment Requirements</h4>
        <p className="text-sm text-orange-800">{data.title || "Equipment Information"}</p>
        <p className="mt-2 text-xs text-orange-700">
          (Full equipment requirements are shown in the course player.)
        </p>
      </div>
    );
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
    .order("created_at", { ascending: true })
    // Temporarily include quiz data from the separate quiz table if module type is quiz
    .then(async (res) => {
      if (res.error) return res;
      if (res.data && res.data.length === 0) {
        // Check if this is a quiz module and load quiz data if it exists
        const { data: mod } = await supabase
          .from("course_modules")
          .select("type")
          .eq("id", moduleId)
          .maybeSingle();

        if (mod?.type === "digital_assessment_quiz") {
          const { data: quizData } = await supabase
            .from("quizzes")
            .select("id, title, questions") // Assuming 'questions' is a JSONB field
            .eq("module_id", moduleId)
            .maybeSingle();

          if (quizData && quizData.questions) {
            // Convert quiz data into a single content block
            const quizBlock = {
              id: `quiz-${quizData.id}`,
              module_id: moduleId,
              kind: "quiz_questions", // Use a new kind for quizzes
              data: {
                title: quizData.title,
                questions: quizData.questions,
                pass_mark: quizData.pass_mark,
                max_attempts: quizData.max_attempts,
                shuffle: quizData.shuffle,
                show_feedback: quizData.show_feedback,
              },
              order_index: 0, // Place it at the beginning
              created_at: quizData.created_at,
            };
            return { data: [quizBlock], error: null };
          }
        }
      }
      return res;
    });
  return resp.data ?? [];
}

interface LearnerModuleSearchParams extends Record<string, string | string[] | undefined> {
  preview?: string | string[] | undefined;
}

export default async function LearnerModulePage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<LearnerModuleSearchParams>;
}) {
  const { id } = await props.params;
  const sp: LearnerModuleSearchParams = (await (props.searchParams ?? Promise.resolve({}))) || {};
  const preview = ((Array.isArray(sp.preview) ? sp.preview[0] : sp.preview) ?? "") === "1";

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !preview) redirect("/auth/signin");

  const { data: mod, error: mErr } = await supabase
    .from("course_modules")
    .select("id, course_id, type, title, created_at")
    .eq("id", id)
    .maybeSingle();

  if (mErr || !mod) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Module</h1>
        <p className="text-red-600">Module not found.</p>
        <Link href="/app/creator" className="underline">Back</Link>
      </div>
    );
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, status, created_by")
    .eq("id", mod.course_id)
    .maybeSingle();

  if (!course) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Module</h1>
        <p className="text-red-600">Parent course not found.</p>
        <Link href="/app/creator" className="underline">Back</Link>
      </div>
    );
  }

  // If not preview and course is not yet published, only creators/assignees may view
  if (!preview && course.status !== "published") {
    const isCreator = user?.id && course.created_by === user.id;
    let isAssigned = false;
    if (user?.id) {
      const { data: assignment } = await supabase
        .from("course_assignments")
        .select("id")
        .eq("course_id", course.id)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      isAssigned = !!assignment;
    }
    if (!isCreator && !isAssigned) {
      return (
        <div className="space-y-3 p-6">
          <h1 className="text-xl font-semibold">{mod.title ?? "Module"}</h1>
          <p className="text-gray-600">This module is not available to learners yet.</p>
          <Link href={`/app/learn/courses/${course.id}?preview=1`} className="underline text-sm">
            Open course preview
          </Link>
        </div>
      );
    }
  }

  const blocks = await loadBlocks(mod.id);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{mod.title ?? "Module"}</h1>
          <div className="text-xs text-gray-500">{mod.type}</div>
          {preview && (
            <div className="mt-2 rounded-md border border-yellow-300 bg-yellow-50 px-2 py-1 text-xs text-yellow-900">
              Preview mode — content is read-only. Use the course view to record progress or upload documents.
            </div>
          )}
        </div>
        <Link
          href={`/app/learn/courses/${course.id}?${preview ? "preview=1" : ""}`}
          className="rounded-md border px-3 py-1 text-sm"
        >
          Back to course
        </Link>
      </div>

      {/* Content */}
      <div className="rounded-xl border bg-white p-4 space-y-4">
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-600">No content yet.</p>
        ) : (
          blocks.map((block: any) => { // Added 'any' to block type for compatibility
            // Mock handleVideoProgress and DocumentRequestBlock for server component context
            const handleVideoProgress = (progress: number) => {
              console.log(`Video progress: ${progress}`);
            };
            const DocumentRequestBlock = ({ moduleId, blockId, label, requireExpiry, currentUserId }: any) => (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-xl">📤</span>
                  <div>
                    <h4 className="font-medium text-sm mb-1">Document Upload Required</h4>
                    <p className="text-sm text-gray-700 mb-2">{label}</p>
                    <p className="text-xs text-gray-500">
                      Upload your document in the{" "}
                      <Link 
                        href={`/app/learn/courses/${course.id}`}
                        className="underline text-blue-600"
                      >
                        full course view
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </div>
            );

            return (
              <div key={block.id} className="rounded-lg border p-4">
                {block.kind === "rich_text" && (
                  <div className="prose max-w-none">
                    <div className="whitespace-pre-wrap">{block.data?.text || ""}</div>
                  </div>
                )}

                {block.kind === "link" && (
                  <div>
                    <a
                      href={block.data?.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 underline"
                    >
                      {block.data?.label || block.data?.url || "Link"} ↗
                    </a>
                  </div>
                )}

                {block.kind === "equipment_form" && (
                  <EquipmentFormBlock
                    courseId={course.id}
                    blockData={block.data}
                    preview={preview}
                  />
                )}

                {block.kind === "file" && (
                  <div>
                    {block.data?.storage_path ? (
                      <a
                        href={`/app/files/${encodeURIComponent(block.data.storage_path)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-blue-600 underline"
                      >
                        📎 {block.data?.display || "Download file"}
                      </a>
                    ) : (
                      <p className="text-gray-500">No file attached</p>
                    )}
                  </div>
                )}

                {block.kind === "video_embed" && block.data?.url && (
                  <UnifiedVideoPlayer videoUrl={block.data.url} title={block.data.title || "Course Video"} />
                )}
                {block.kind === "video_embed" && !block.data?.url && block.data?.pending_format_fix && (
                  <p className="text-sm text-gray-600">⏳ This video is being processed and will be available shortly. Please check back in a few minutes.</p>
                )}

                {block.kind === "quiz_questions" && (
                  <QuizQuestionsBlock
                    moduleId={moduleId}
                    blockId={block.id}
                    questions={block.data?.questions || []}
                    settings={{
                      pass_mark: block.data?.pass_mark || 80,
                      max_attempts: block.data?.max_attempts || 3,
                      shuffle: block.data?.shuffle ?? true,
                      show_feedback: block.data?.show_feedback ?? true
                    }}
                    currentUserId={user.id}
                    preview={preview}
                  />
                )}

                {block.kind === "request_document" && (
                  <DocumentRequestBlock
                    moduleId={moduleId}
                    blockId={block.id}
                    label={block.data?.label || "Please upload the requested document."}
                    requireExpiry={!!block.data?.require_expiry}
                    currentUserId={user.id}
                  />
                )}

                {block.kind === "equipment_form" && (
                  <EquipmentFormBlock
                    courseId={course.id}
                    blockData={block.data}
                    preview={preview}
                  />
                )}
              </div>
            );
          })
        )}

        {/* For quiz modules, provide a launcher into the quiz player. */}
        {mod.type === "digital_assessment_quiz" && !blocks.some((b: any) => b.kind === "quiz_questions") && (
          <div className="pt-2">
            <Link
              href={`/app/learn/courses/${course.id}?module=${mod.id}&quiz=start${preview ? "&preview=1" : ""}`}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Start quiz
            </Link>
          </div>
        )}

        {/* For document-request style content, nudge to the course page for the upload. */}
        {blocks.some((b: any) => b.kind === "request_document") && (
          <div className="mt-4 p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-800 mb-2">📤 This module contains document upload requirements.</p>
            <p className="text-xs text-blue-600">
              Document uploads are handled in the full course view.{" "}
              <Link
                href={`/app/learn/courses/${course.id}?${preview ? "preview=1" : ""}`}
                className="underline font-medium"
              >
                Open course
              </Link>
              {" "}to upload your documents.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}