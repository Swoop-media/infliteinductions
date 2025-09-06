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

  // Placeholder for VideoPlayerComponent if it exists
  // In a real app, you might import this from another file or define it elsewhere
  const VideoPlayerComponent = undefined; // Replace with actual import if available

  // Placeholder for BlockView if it exists
  const BlockView = ({ block }: { block: Block }) => {
    if (block.kind === "rich_text") return <RichText html={String(block.data?.html || block.data?.content || "")} />;
    if (block.kind === "file") return <FileBlock data={block.data} />;
    if (block.kind === "video_embed") return <VideoEmbed data={block.data} />;
    if (block.kind === "link") return <LinkBlock data={block.data} />;
    return <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">Unsupported block kind: {block.kind}</div>;
  };

  // Dynamically get moduleBlocks based on the current module ID
  const moduleBlocks = useMemo(() => {
    // This part of the code needs access to all blocks to filter them.
    // Assuming 'blocks' is accessible in this scope or passed as a prop.
    // For simplicity, let's assume 'blocks' is available globally or passed.
    // In a real scenario, you'd likely pass 'blocks' as a prop to PageView.
    const allBlocks: Block[] = []; // Replace with actual blocks data
    return allBlocks.filter(b => b.module_id === module.id).sort((a, b) => a.order_index - b.order_index);
  }, [module.id]);


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

// Static component for onsite module preview (doesn't use server actions)
function OnsiteModulePreviewStatic({ moduleId, moduleTitle, moduleType, courseId }: {
  moduleId: string;
  moduleTitle: string;
  moduleType: "onsite_training" | "onsite_assessment";
  courseId: string;
}) {
  const roleLabel = moduleType === 'onsite_training' ? 'Trainer' : 'Assessor';
  const actionLabel = moduleType === 'onsite_training' ? 'training' : 'assessment';

  return (
    <div className="bg-white p-6 rounded-lg border">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-16 h-16 bg-orange-100 rounded-lg flex items-center justify-center">
            {moduleType === 'onsite_training' ? (
              <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v6a2 2 0 002 2h2m0-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2m0-10V3a2 2 0 00-2-2H9a2 2 0 00-2 2v2m0 10V3a2 2 0 012-2h2a2 2 0 012 2v2m0 10v2a2 2 0 01-2 2H9a2 2 0 01-2-2v-2" />
              </svg>
            )}
          </div>
        </div>

        <div className="flex-1">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{moduleTitle}</h3>
          <div className="text-sm text-gray-600 mb-4">Onsite {roleLabel} Module</div>

          <div className="bg-blue-50 p-4 rounded-lg mb-4">
            <p className="text-sm text-blue-800">
              <strong>Preview Mode:</strong> This is an onsite {actionLabel} module. In a real course, this would be completed by a {roleLabel.toLowerCase()} during an in-person session with the trainee.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">
              {roleLabel} Requirements Checklist:
            </h4>

            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 border-2 border-gray-300 rounded bg-white"></div>
                <span className="text-sm text-gray-700">Sample requirement checklist item</span>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 border-2 border-gray-300 rounded bg-white"></div>
                <span className="text-sm text-gray-700">Practical demonstration completed</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-gray-300 rounded bg-white"></div>
                <span className="text-sm text-gray-700">Safety procedures verified</span>
              </div>
            </div>

            <div className="text-xs text-gray-500 italic">
              * Actual requirements are configured by the course creator in the module builder
            </div>
          </div>

          <div className="mt-6 p-3 bg-orange-50 rounded-lg">
            <p className="text-sm text-orange-800">
              <strong>In actual {actionLabel}:</strong> The {roleLabel.toLowerCase()} would complete the requirements checklist while working with the trainee, then mark the module as complete to advance the trainee's progress.
            </p>
          </div>
        </div>
      </div>
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

  // Placeholder for VideoPlayerComponent and BlockView if they are not defined globally
  // In a real app, ensure these are imported or defined appropriately.
  const VideoPlayerComponent = undefined; // Replace with actual component if it exists
  const BlockView = ({ block }: { block: Block }) => {
    if (!block) return <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">Missing content block.</div>;

    switch (block.kind) {
      case "rich_text":
        return <RichText html={String(block.data?.html || block.data?.content || "")} />;
      case "file":
        return <FileBlock data={block.data} />;
      case "video_embed":
        // This assumes VideoPlayerComponent is available and handles the 'url' prop.
        // Adjust as necessary based on the actual VideoPlayerComponent implementation.
        return VideoPlayerComponent ? (
          <VideoPlayerComponent url={block.data.url ?? ''} courseId={courseId} title="Training Video" />
        ) : (
          <VideoEmbed data={block.data} />
        );
      case "link":
        return <LinkBlock data={block.data} />;
      default:
        return <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">Unsupported block kind: {block.kind}</div>;
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
            <>
              {/* Digital Training Module */}
              {page.module.type === "digital_training" && (
                <div className="bg-white p-6 rounded-lg border">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                    </div>

                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">{page.module.title}</h3>
                      <div className="text-sm text-gray-600 mb-4">Digital Training Module</div>

                      {/* Render content blocks for this module */}
                      <div className="space-y-4">
                        {blocks
                          .filter(b => b.module_id === page.module.id)
                          .map((block) => (
                            <div key={block.id}>
                              {block.kind === 'video_embed' && VideoPlayerComponent ? (
                                <VideoPlayerComponent
                                  url={block.data.url ?? ''}
                                  courseId={courseId}
                                  title="Training Video"
                                />
                              ) : (
                                <BlockView block={block} />
                              )}
                            </div>
                          ))}

                        {blocks.filter(b => b.module_id === page.module.id).length === 0 && (
                          <div className="text-center py-8">
                            <div className="text-gray-400 mb-4">
                              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <h4 className="text-lg font-medium text-gray-900 mb-2">No Content Available</h4>
                            <p className="text-gray-600">This training module doesn't have any content blocks yet.</p>
                          </div>
                        )}
                      </div>

                      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-800">
                          <strong>Preview Mode:</strong> In a real course, learners would click "Mark as Complete" here after reviewing all content.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Onsite Training Module */}
              {page.module.type === "onsite_training" && (
                <OnsiteModulePreviewStatic
                  moduleId={page.module.id}
                  moduleTitle={page.module.title}
                  moduleType="onsite_training"
                  courseId={courseId}
                />
              )}

              {/* Onsite Assessment Module */}
              {page.module.type === "onsite_assessment" && (
                <OnsiteModulePreviewStatic
                  moduleId={page.module.id}
                  moduleTitle={page.module.title}
                  moduleType="onsite_assessment"
                  courseId={courseId}
                />
              )}

              {/* Render other page types */}
              {!["digital_training", "onsite_training", "onsite_assessment"].includes(page.module.type) && (
                <PageView page={page} />
              )}
            </>
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