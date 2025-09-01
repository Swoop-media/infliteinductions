"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";

/** Data shapes coming from your pages */
type Module = {
  id: string;
  course_id: string;
  title: string;
  type: "digital_training" | "digital_assessment_quiz" | "onsite_training" | "onsite_assessment";
  order_index: number;
  stage?: string | null;
};

type Block = {
  id: string;
  module_id: string;
  kind: "rich_text" | "file" | "video_embed" | "link";
  data: any;
  order_index: number;
};

type Page = {
  module: Module;
  block?: Block;
  pageKind: "content_block" | "quiz" | "onsite_training" | "onsite_assessment";
  indexLabel: string;
};

/** Helpers to render content blocks */
function RichText({ html }: { html: string }) {
  return (
    <div
      className="prose max-w-none prose-p:my-3 prose-li:list-disc prose-ul:ml-5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function FileBlock({ data }: { data: any }) {
  const url: string | undefined = data?.url || data?.path || data?.publicUrl || data?.public_url;
  const label: string = data?.label || data?.name || "Download file";
  if (!url) {
    return <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">File reference missing a URL.</div>;
  }
  return (
    <a
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      <span aria-hidden>📄</span>
      {label}
    </a>
  );
}

function VideoEmbed({ data }: { data: any }) {
  const src: string | undefined = data?.embedUrl || data?.embed_url || data?.url;
  const title: string = data?.title || "Embedded video";
  if (!src) {
    return <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">Video block missing an embed URL.</div>;
  }
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border">
      <iframe
        src={src}
        title={title}
        className="h-full w-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function LinkBlock({ data }: { data: any }) {
  const href: string | undefined = data?.url || data?.href;
  const label: string = data?.label || data?.text || href || "Open link";
  if (!href) return <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">Link missing a URL.</div>;
  return (
    <a className="text-blue-600 underline" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

/** One page renderer */
function PageView({ page }: { page: Page }) {
  const { module, pageKind, block } = page;

  if (pageKind === "quiz") {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Quiz: {module.title}</h3>
        <div className="rounded-md bg-indigo-50 p-3 text-indigo-800">
          This is a placeholder. Wire this to <code>quiz_questions</code> / <code>quiz_options</code> /{" "}
          <code>quiz_answers</code> to make it functional.
        </div>
      </div>
    );
  }

  if (pageKind === "onsite_training") {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Onsite Training: {module.title}</h3>
        <p className="text-sm text-gray-600">
          In learner mode, show schedules/venue and trainer notes if applicable.
        </p>
      </div>
    );
  }

  if (pageKind === "onsite_assessment") {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Onsite Assessment: {module.title}</h3>
        <p className="text-sm text-gray-600">Assessed in person. Show instructions/prereqs here.</p>
      </div>
    );
  }

  if (!block) {
    return <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">Missing content block.</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{module.title}</h3>
      {block.kind === "rich_text" && <RichText html={String(block.data?.html || block.data?.content || "")} />}
      {block.kind === "file" && <FileBlock data={block.data} />}
      {block.kind === "video_embed" && <VideoEmbed data={block.data} />}
      {block.kind === "link" && <LinkBlock data={block.data} />}
    </div>
  );
}

type CoursePreviewProps = {
  courseId: string;
  courseTitle: string;
  courseDescription: string;
  modules: Array<{
    id: string;
    course_id: string;
    title: string;
    type: string;
    order_index: number;
    stage?: string;
  }>;
  blocks: Array<{
    id: string;
    module_id: string;
    kind: string;
    data: any;
    order_index: number;
  }>;
  mode?: "preview" | "learner";
  assignmentId?: string;
};

export default function CoursePreview({
  courseId,
  courseTitle,
  courseDescription = "",
  modules,
  blocks,
  mode = "preview",
  assignmentId,
  assignmentProgress = [],
}: {
  courseId: string;
  courseTitle: string;
  courseDescription: string;
  modules: Array<{
    id: string;
    course_id: string;
    title: string;
    type: string;
    order_index: number;
    stage?: string;
  }>;
  blocks: Array<{
    id: string;
    module_id: string;
    kind: string;
    data: any;
    order_index: number;
  }>;
  mode?: "preview" | "learner";
  assignmentId?: string;
  assignmentProgress?: Array<{ module_id: string; completed_at: string }>;
}) {
  const pages: Page[] = useMemo(() => {
    const mods = [...modules].sort((a, b) => {
      if (a.order_index === b.order_index) return a.title.localeCompare(b.title);
      return a.order_index - b.order_index;
    });

    const byModule = new Map<string, Block[]>();
    for (const b of blocks) {
      if (!byModule.has(b.module_id)) byModule.set(b.module_id, []);
      byModule.get(b.module_id)!.push(b);
    }
    for (const [, arr] of byModule) arr.sort((a, b) => a.order_index - b.order_index);

    let result: Page[] = [];
    let moduleCounter = 0;

    for (const m of mods) {
      moduleCounter += 1;

      if (m.type === "digital_training") {
        const arr = byModule.get(m.id) ?? [];
        if (arr.length === 0) {
          result.push({
            module: m,
            pageKind: "content_block",
            block: undefined,
            indexLabel: `Module ${moduleCounter} · (empty)`,
          });
        } else {
          arr.forEach((blk, idx) => {
            result.push({
              module: m,
              block: blk,
              pageKind: "content_block",
              indexLabel: `Module ${moduleCounter} · Page ${idx + 1} of ${arr.length}`,
            });
          });
        }
      } else if (m.type === "digital_assessment_quiz") {
        result.push({
          module: m,
          pageKind: "quiz",
          indexLabel: `Quiz ${moduleCounter}`,
        });
      } else if (m.type === "onsite_training") {
        result.push({
          module: m,
          pageKind: "onsite_training",
          indexLabel: `Onsite Training ${moduleCounter}`,
        });
      } else if (m.type === "onsite_assessment") {
        result.push({
          module: m,
          pageKind: "onsite_assessment",
          indexLabel: `Onsite Assessment ${moduleCounter}`,
        });
      }
    }

    return result;
  }, [modules, blocks]);

  const [idx, setIdx] = useState(0);
  const total = pages.length;
  const clampedIdx = Math.max(0, Math.min(idx, Math.max(0, total - 1)));
  const page = pages[clampedIdx];

  const goPrev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIdx((i) => Math.min(total - 1, i + 1)), [total]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  const progress = total > 0 ? Math.round(((clampedIdx + 1) / total) * 100) : 0;

  // Track module completion
  const [completedModules, setCompletedModules] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (mode === "learner" && assignmentProgress) {
      // Set completed modules from assignment progress
      const completed = new Set(assignmentProgress.map(p => p.module_id));
      setCompletedModules(completed);
    }
  }, [mode, assignmentProgress]);

  // Persist progress in learner mode (fire-and-forget)
  useEffect(() => {
    if (mode !== "learner" || !page) {
      console.log("Progress tracking skipped:", { mode, hasPage: !!page });
      return;
    }

    const moduleId = page.module.id;

    // For digital training modules, check if we're on the last page of THIS specific module
    const currentModulePages = pages.filter(p => p.module.id === moduleId);
    const currentModulePageIndex = currentModulePages.findIndex(p => 
      p.module.id === page.module.id && 
      p.block?.id === page.block?.id &&
      p.pageKind === page.pageKind
    );
    const isLastPageOfCurrentModule = currentModulePageIndex === currentModulePages.length - 1;

    console.log("🔍 Progress tracking debug:", {
      mode,
      moduleId,
      moduleType: page.module.type,
      pageIndex: clampedIdx,
      totalPages: total,
      isLastPageOfCurrentModule,
      assignmentId,
      courseId,
      currentModulePages: currentModulePages.length,
      currentModulePageIndex,
      hasAssignmentId: !!assignmentId,
      pageBlockId: page.block?.id,
      pageKind: page.pageKind
    });

    // Use assignment progress tracking if assignmentId is provided
    if (assignmentId) {
      let shouldSaveProgress = false;
      let reason = "";

      // For digital training modules, save progress when completing the module (last page)
      if (page.module.type === "digital_training" && isLastPageOfCurrentModule) {
        shouldSaveProgress = true;
        reason = "completed digital training module (last page)";
        console.log("🎯 Triggering assignment progress for completed digital training module:", moduleId);
      }

      // For quiz/assessment/onsite modules, save progress immediately when viewed
      if (page.module.type === "digital_assessment_quiz" || 
          page.module.type === "onsite_assessment" || 
          page.module.type === "onsite_training") {
        shouldSaveProgress = true;
        reason = `viewed ${page.module.type} module`;
        console.log("🎯 Triggering assignment progress for assessment/training module:", moduleId);
      }

      console.log("📊 Progress decision:", {
        shouldSaveProgress,
        reason,
        moduleType: page.module.type,
        isLastPage: isLastPageOfCurrentModule
      });

      if (shouldSaveProgress) {
        console.log("📤 Sending assignment progress request...");
        fetch("/api/assignment/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignmentId,
            moduleId,
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
      } else {
        console.log("⏭️ Skipping progress save for this page");
      }
    } else {
      console.log("Saving learner progress for module:", moduleId);
      // Use existing learner progress for enrolment-based tracking
      const isLastPageOfModule = clampedIdx >= total - 1;
      fetch("/api/learner/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          moduleId: page.module.id,
          blockId: page.block?.id ?? null,
          pageIndex: clampedIdx,
          totalPages: total,
          completed: isLastPageOfModule,
        }),
      })
      .then(response => response.json())
      .then(data => console.log("Learner progress saved:", data))
      .catch(error => console.error("Learner progress error:", error));
    }
  }, [mode, page, clampedIdx, total, courseId, assignmentId, pages]);

  const markModuleComplete = async (moduleId: string) => {
    if (mode !== "learner" || !assignmentId) return;

    try {
      const response = await fetch("/api/assignment/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, moduleId }),
      });

      if (response.ok) {
        setCompletedModules((prev) => new Set([...prev, moduleId]));
      } else {
        console.error("Failed to mark module complete");
      }
    } catch (error) {
      console.error("Error marking module complete:", error);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      {/* Left rail: outline */}
      <aside className="h-full rounded-xl border p-4">
        <div className="mb-3 font-semibold">{courseTitle || "Course"}</div>
        {courseDescription ? (
          <p className="mb-4 line-clamp-3 text-sm text-gray-600">{courseDescription}</p>
        ) : null}

        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Outline</div>
        <ol className="space-y-1 text-sm">
          {pages.map((p, i) => {
            const active = i === clampedIdx;
            return (
              <li key={`${p.pageKind}-${p.block?.id ?? p.module.id}-${i}`}>
                <button
                  onClick={() => setIdx(i)}
                  className={[
                    "w-full rounded-md px-2 py-1 text-left",
                    active ? "bg-black text-white" : "hover:bg-gray-50",
                  ].join(" ")}
                >
                  <span className="block truncate">{p.indexLabel}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {p.pageKind.replaceAll("_", " ")} — {p.module.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Main content */}
      <section className="space-y-4">
        {mode === "preview" && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <strong>Preview:</strong> Mirrors the learner UI. Progress isn’t saved.
          </div>
        )}

        {/* Progress bar */}
        <div className="rounded-xl border p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{page?.indexLabel || "No content"}</span>
            </div>
            <div className="tabular-nums text-gray-600">
              {total > 0 ? `${clampedIdx + 1} / ${total}` : "0 / 0"}
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-100">
            <div
              className="h-2 bg-black transition-all"
              style={{ width: `${progress}%` }}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              role="progressbar"
            />
          </div>
        </div>

        {/* Page body */}
        <div className="rounded-xl border p-4">
          {page ? (
            <PageView page={page} />
          ) : (
            <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">
              This course doesn’t have any content yet.
            </div>
          )}
        </div>

        {/* Nav buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={clampedIdx === 0}
            className={[
              "rounded-md border px-4 py-2 text-sm",
              clampedIdx === 0 ? "opacity-50" : "hover:bg-gray-50",
            ].join(" ")}
          >
            ← Previous
          </button>

          <button
            onClick={goNext}
            disabled={clampedIdx >= total - 1}
            className={[
              "rounded-md border px-4 py-2 text-sm",
              clampedIdx >= total - 1 ? "opacity-50" : "hover:bg-gray-50",
            ].join(" ")}
          >
            Next →
          </button>
        </div>

        <div className="text-right">
          <Link href="/app/creator" className="text-sm text-gray-600 underline">
            Exit
          </Link>
        </div>
      </section>
    </div>
  );
}