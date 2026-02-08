"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseBrowser } from "@/lib/supabase/client";

interface ContractorCourseProps {
  siteId: string;
  siteName: string;
  contractorName: string;
  contractorCompany: string;
  workingAirside: boolean;
  onBack: () => void;
  onComplete: () => void;
}

interface ContentBlock {
  id: string;
  kind: string;
  data: any;
  order_index: number;
}

interface CourseModule {
  id: string;
  title: string;
  order_index: number;
  content_blocks?: ContentBlock[];
}

function fileProxy(path: string) {
  return `/app/files/${encodeURIComponent(path)}`;
}

function isImagePath(p: string) {
  const ext = p.split(".").pop()?.toLowerCase();
  return !!ext && ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext);
}

function toEmbedUrl(raw: string) {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
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
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

function BlockRenderer({ block }: { block: ContentBlock }) {
  const { kind, data } = block;

  if (kind === "rich_text") {
    const text = String(data?.text ?? "");
    return (
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  }

  if (kind === "video_embed") {
    const url = String(data?.url ?? "");
    if (!url) return null;
    const embedUrl = toEmbedUrl(url);
    return (
      <div className="aspect-video w-full max-w-2xl">
        <iframe
          src={embedUrl}
          className="h-full w-full rounded-md border"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
    );
  }

  if (kind === "file") {
    const path = String(data?.path ?? data?.file_path ?? "");
    if (!path) return null;
    const href = fileProxy(path);
    const display = data?.displayName || data?.display_name || path.split("/").pop() || "Download";
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const isImage = isImagePath(path);
    const isPDF = ext === "pdf";

    if (isImage) {
      return (
        <figure className="space-y-1">
          <img
            src={href}
            alt={display}
            className="max-h-[400px] w-auto rounded-md border object-contain"
          />
          <figcaption className="text-xs text-gray-500">
            {display}
          </figcaption>
        </figure>
      );
    }

    if (isPDF) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-t-md border">
            <span className="text-sm font-medium text-gray-900">{display}</span>
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
              Open in new tab
            </a>
          </div>
          <div className="border rounded-b-md bg-white">
            <iframe
              src={`${href}#toolbar=1&navpanes=1&scrollbar=1`}
              className="w-full h-[500px] rounded-b-md"
              title={display}
            />
          </div>
        </div>
      );
    }

    return (
      <p className="text-sm">
        ⬇️{" "}
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline break-all">
          {display}
        </a>
      </p>
    );
  }

  if (kind === "link") {
    const url = String(data?.url ?? "");
    const label = String(data?.label ?? data?.text ?? url);
    if (!url) return null;
    return (
      <p className="text-sm">
        🔗{" "}
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
          {label}
        </a>
      </p>
    );
  }

  return null;
}

export default function ContractorCourse({ 
  siteId, 
  siteName, 
  contractorName, 
  contractorCompany,
  workingAirside,
  onBack, 
  onComplete 
}: ContractorCourseProps) {
  const [course, setCourse] = useState<any>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContractorCourse = async () => {
      try {
        // Match the flow type values used in the course creator:
        // - "airside_induction" for "Yes to airside"
        // - "site_induction" for "No to airside"
        const flowType = workingAirside ? "airside_induction" : "site_induction";
        
        const { data: courseData, error: courseError } = await supabaseBrowser
          .from("courses" as any)
          .select("*, course_modules(*)")
          .eq("contractor_flow_type", flowType)
          .eq("contractor_site_id", siteId)
          .limit(1)
          .single();

        if (courseError && courseError.code !== "PGRST116") {
          console.error("Error fetching contractor course:", courseError);
        }

        if (courseData) {
          setCourse(courseData);
          const courseDataTyped = courseData as any;
          const sortedModules = (courseDataTyped.course_modules || []).sort(
            (a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)
          );

          const modulesWithContent: CourseModule[] = await Promise.all(
            sortedModules.map(async (mod: any) => {
              const { data: blocks } = await supabaseBrowser
                .from("module_content_blocks" as any)
                .select("*")
                .eq("module_id", mod.id)
                .order("order_index", { ascending: true });
              return {
                ...mod,
                content_blocks: blocks || [],
              };
            })
          );

          setModules(modulesWithContent);
        }
      } catch (err) {
        console.error("Error in fetchContractorCourse:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchContractorCourse();
  }, [siteId, workingAirside]);

  const handleComplete = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/contractor-signin/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractor_name: contractorName,
          contractor_company: contractorCompany || null,
          site_id: siteId,
          course_id: course?.id || null,
          course_completed: true,
          working_airside: workingAirside,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Sign-in failed");
      }

      onComplete();
    } catch (err: any) {
      console.error("Error completing contractor course:", err);
      setError(err.message || "Failed to complete. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!course) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-gray-600">
              No induction course found for this site. You can proceed to sign in.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={onBack}>
                Back
              </Button>
              <Button onClick={handleComplete} disabled={isSubmitting}>
                {isSubmitting ? "Signing In..." : "Sign In"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentModule = modules[currentModuleIndex];
  const isLastModule = currentModuleIndex === modules.length - 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{course.title}</CardTitle>
          {course.description && (
            <p className="text-gray-600 text-sm">{course.description}</p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <span>Site: {siteName}</span>
            <span>•</span>
            <span>Module {currentModuleIndex + 1} of {modules.length}</span>
          </div>

          {currentModule && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">{currentModule.title}</h3>
              
              {currentModule.content_blocks && currentModule.content_blocks.length > 0 ? (
                <div className="space-y-4">
                  {currentModule.content_blocks.map((block) => (
                    <BlockRenderer key={block.id} block={block} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">No content in this module.</p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-between mt-8 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                if (currentModuleIndex > 0) {
                  setCurrentModuleIndex(currentModuleIndex - 1);
                } else {
                  onBack();
                }
              }}
            >
              {currentModuleIndex > 0 ? "Previous" : "Back"}
            </Button>

            {isLastModule ? (
              <Button onClick={handleComplete} disabled={isSubmitting}>
                {isSubmitting ? "Completing..." : "Complete & Sign In"}
              </Button>
            ) : (
              <Button onClick={() => setCurrentModuleIndex(currentModuleIndex + 1)}>
                Next
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
