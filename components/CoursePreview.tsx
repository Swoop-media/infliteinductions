// @ts-nocheck
"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SimpleVideoPlayer from "./SimpleVideoPlayer";
import SharePointVideoEmbed from "./SharePointVideoEmbed";
import PowerPointSlideshow from "./PowerPointSlideshow";

/** Data shapes coming from your pages */
type Module = {
  id: string;
  course_id: string;
  title: string;
  type: "digital_training" | "digital_assessment_quiz" | "onsite_training" | "onsite_assessment" | "request_document";
  order_index: number;
  stage?: string | null;
};

type Block = {
  id: string;
  module_id: string;
  kind: "rich_text" | "file" | "video_embed" | "link" | "request_document" | "quiz_questions";
  data: any;
  order_index: number;
};

type Page = {
  module: Module;
  block?: Block;
  pageKind: "content_block" | "quiz" | "onsite_training" | "onsite_assessment" | "request_document";
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

  // Detect file type from URL or label
  const getFileType = (url: string, label: string) => {
    const urlLower = url.toLowerCase();
    const labelLower = label.toLowerCase();
    
    if (urlLower.includes('.pdf') || labelLower.includes('.pdf')) return 'pdf';
    if (urlLower.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) || labelLower.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) return 'image';
    if (urlLower.match(/\.(doc|docx)$/i) || labelLower.match(/\.(doc|docx)$/i)) return 'word';
    if (urlLower.match(/\.(xls|xlsx)$/i) || labelLower.match(/\.(xls|xlsx)$/i)) return 'excel';
    if (urlLower.match(/\.(ppt|pptx)$/i) || labelLower.match(/\.(ppt|pptx)$/i)) return 'powerpoint';
    if (urlLower.match(/\.(txt|md)$/i) || labelLower.match(/\.(txt|md)$/i)) return 'text';
    return 'other';
  };

  const fileType = getFileType(url, label);

  // Get appropriate icon based on file type
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf': return '📕';
      case 'image': return '🖼️';
      case 'word': return '📝';
      case 'excel': return '📊';
      case 'powerpoint': return '📽️';
      case 'text': return '📄';
      default: return '📎';
    }
  };

  const renderInlinePreview = () => {
    switch (fileType) {
      case 'pdf':
        return (
          <div className="w-full">
            <iframe
              src={url}
              className="w-full h-96 border rounded-md"
              title={label}
              loading="lazy"
            />
          </div>
        );
      
      case 'image':
        return (
          <div className="w-full">
            <img
              src={url}
              alt={label}
              className="max-w-full h-auto rounded-md border"
              loading="lazy"
            />
          </div>
        );
      
      case 'powerpoint':
        // Extract the actual file path from the proxy URL if it's a proxy URL
        let actualPath = url;
        if (url.includes('/app/files/')) {
          actualPath = decodeURIComponent(url.replace('/app/files/', '').replace(/%2F/g, '/'));
        }
        return (
          <div className="w-full">
            <PowerPointSlideshow filePath={actualPath} title={label} />
          </div>
        );
      
      case 'word':
      case 'excel':
        return (
          <div className="w-full">
            <div className="bg-gray-50 border rounded-md p-8 text-center">
              <div className="text-6xl mb-4">{getFileIcon(fileType)}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {fileType === 'word' ? 'Word Document' : 'Excel Spreadsheet'}
              </h3>
              <p className="text-gray-600 mb-4 max-w-md mx-auto">
                {`${fileType === 'word' ? 'Word documents' : 'Excel spreadsheets'} cannot be previewed in the browser. Click "Open" above to download and view the file.`}
              </p>
              <div className="text-sm text-gray-500">
                <p className="mb-2">📄 <strong>File:</strong> {label}</p>
                <p>🔒 This file is securely stored and requires download to view</p>
              </div>
            </div>
          </div>
        );
      
      default:
        // For other file types, try to show in an iframe
        return (
          <div className="w-full">
            <iframe
              src={url}
              className="w-full h-96 border rounded-md"
              title={label}
              loading="lazy"
            />
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* File Preview */}
      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{getFileIcon(fileType)}</span>
            <div>
              <h4 className="font-medium text-gray-900 text-sm">{label}</h4>
              <p className="text-xs text-gray-500 capitalize">{fileType} file</p>
            </div>
          </div>
          <div>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open
            </a>
          </div>
        </div>
        
        {/* Inline Preview */}
        <div className="p-4">
          {renderInlinePreview()}
        </div>
      </div>
    </div>
  );
}

function VideoEmbed({ data, courseId }: { data: any; courseId?: string }) {
  const src: string | undefined = data?.embedUrl || data?.embed_url || data?.url;
  const title: string = data?.title || "Embedded video";
  
  if (!src) {
    return <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">Video block missing an embed URL.</div>;
  }

  // Check if this is a SharePoint video that needs special authentication handling
  try {
    const url = new URL(src);
    const hostname = url.hostname.replace(/^www\./, '');
    
    if (hostname.includes('.sharepoint.com')) {
      // Use the specialized SharePoint video embed component for authentication
      return <SharePointVideoEmbed url={src} courseId={courseId || 'unknown'} />;
    }
  } catch (error) {
    // If URL parsing fails, fall through to SimpleVideoPlayer
  }

  // For all other video types (YouTube, Vimeo, direct links), use SimpleVideoPlayer
  return <SimpleVideoPlayer url={src} courseId={courseId} title={title} />;
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
function PageView({ page, courseId }: { page: Page; courseId?: string }) {
  const { module, pageKind, block } = page;

  if (pageKind === "quiz") {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Digital Assessment Quiz</h3>
        <div className="rounded-xl border bg-white p-6">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900">{module.title}</h4>
              <p className="text-sm text-gray-600 mt-1">Complete this quiz to proceed</p>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-blue-800">Quiz Preview Mode</span>
              </div>
              <p className="text-sm text-blue-700">
                Use the button below to start the quiz and see how it looks to learners. 
                Your answers won't be saved in preview mode.
              </p>
            </div>

            <div className="flex gap-3">
              <a
                href={`/app/learn/modules/${module.id}?preview=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Quiz Preview
              </a>
              <a
                href={`/app/creator/modules/${module.id}/quiz`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Quiz
              </a>
            </div>
          </div>
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

  if (pageKind === "request_document") {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Document Request: {module.title}</h3>
        <p className="text-sm text-gray-600">This module requests document uploads from learners.</p>
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
      {block.kind === "video_embed" && <VideoEmbed data={block.data} courseId={courseId} />}
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
    type: "digital_training" | "digital_assessment_quiz" | "onsite_training" | "onsite_assessment" | "request_document";
    order_index: number;
    stage?: string;
  }>;
  blocks: Array<{
    id: string;
    module_id: string;
    kind: "rich_text" | "file" | "video_embed" | "link" | "request_document" | "quiz_questions";
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
    type: "digital_training" | "digital_assessment_quiz" | "onsite_training" | "onsite_assessment" | "request_document";
    order_index: number;
    stage?: string;
  }>;
  blocks: Array<{
    id: string;
    module_id: string;
    kind: "rich_text" | "file" | "video_embed" | "link" | "request_document" | "quiz_questions";
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
      } else if (m.type === "request_document") {
        result.push({
          module: m,
          pageKind: "request_document",
          indexLabel: `Document Request ${moduleCounter}`,
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
            <PageView page={page} courseId={courseId} />
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