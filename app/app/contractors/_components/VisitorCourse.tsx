"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseBrowser } from "@/lib/supabase/client";

interface VisitorFormData {
  name: string;
  phone: string;
  email: string;
  site_id: string;
  visiting_user_id: string;
}

interface VisitorCourseProps {
  formData: VisitorFormData;
  siteName: string;
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
        className="prose max-w-none text-gray-700"
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  }

  if (kind === "link") {
    const url = String(data?.url ?? "");
    const label = String(data?.label ?? url) || "Link";
    return (
      <p className="text-sm">
        🔗{" "}
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 break-all">
          {label}
        </a>
      </p>
    );
  }

  if (kind === "video_embed") {
    const raw = String(data?.url ?? "");
    const embedUrl = toEmbedUrl(raw);
    return raw ? (
      <div className="aspect-video rounded-lg overflow-hidden">
        <iframe
          src={embedUrl}
          className="w-full h-full"
          allowFullScreen
          title="Video"
        />
      </div>
    ) : null;
  }

  if (kind === "file") {
    const display = String(data?.filename ?? data?.display ?? "Download");
    const path: string | null = data?.file_id ?? data?.storage_path ?? null;

    if (!path) return null;

    const href = fileProxy(path);
    const isPDF = path.toLowerCase().endsWith('.pdf');

    if (isImagePath(path)) {
      return (
        <figure className="space-y-2">
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

  return null;
}

export default function VisitorCourse({ formData, siteName, onBack, onComplete }: VisitorCourseProps) {
  const [course, setCourse] = useState<any>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVisitorCourse = async () => {
      try {
        const { data: courseData, error: courseError } = await supabaseBrowser
          .from("courses" as any)
          .select("*, course_modules(*)")
          .eq("visitor_flow_type", "visitor_induction")
          .or(`contractor_site_id.eq.${formData.site_id},contractor_site_id.is.null`)
          .eq("active", true)
          .order("contractor_site_id", { ascending: false, nullsFirst: false })
          .limit(1)
          .single();

        if (courseError && courseError.code !== "PGRST116") {
          console.error("Error fetching visitor course:", courseError);
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
        console.error("Error loading visitor course:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchVisitorCourse();
  }, [formData.site_id]);

  const handleSignIn = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const signedInAt = new Date().toISOString();
      
      const { error: insertError } = await supabaseBrowser
        .from("visitor_signins" as any)
        .insert({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          site_id: formData.site_id,
          visiting_user_id: formData.visiting_user_id,
          signed_in_at: signedInAt,
          course_completed: course?.id || null,
        } as any);

      if (insertError) {
        throw insertError;
      }

      if (formData.visiting_user_id) {
        try {
          await fetch("/api/notify/visitor-signin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              visitorName: formData.name,
              visitorEmail: formData.email,
              visitorPhone: formData.phone,
              visitingUserId: formData.visiting_user_id,
              siteName: siteName,
              signedInAt,
            }),
          });
        } catch (notifyErr) {
          console.error("Failed to send Teams notification:", notifyErr);
        }
      }

      onComplete();
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-gray-500">Loading course...</div>
      </div>
    );
  }

  if (!course || modules.length === 0) {
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Visitor Induction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              No induction course is currently configured for this site. You can proceed to sign in.
            </p>
            
            {error && (
              <div className="text-red-500 text-sm">{error}</div>
            )}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
                Back
              </Button>
              <Button 
                className="flex-1 bg-green-600 hover:bg-green-700" 
                onClick={handleSignIn}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in..." : "Sign In"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentModule = modules[currentModuleIndex];
  const isLastModule = currentModuleIndex === modules.length - 1;
  const progress = ((currentModuleIndex + 1) / modules.length) * 100;

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <CardTitle className="text-lg">{course.title}</CardTitle>
            <span className="text-sm text-gray-500">
              {currentModuleIndex + 1} of {modules.length}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold mb-4">{currentModule.title}</h3>
            
            <div className="space-y-4">
              {currentModule.content_blocks?.map((block) => (
                <BlockRenderer key={block.id} block={block} />
              ))}
              
              {(!currentModule.content_blocks || currentModule.content_blocks.length === 0) && (
                <p className="text-gray-500 italic">No content available for this module.</p>
              )}
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}

          <div className="flex gap-3 pt-4">
            {currentModuleIndex > 0 ? (
              <Button 
                variant="outline" 
                onClick={() => setCurrentModuleIndex(prev => prev - 1)}
              >
                Previous
              </Button>
            ) : (
              <Button variant="outline" onClick={onBack}>
                Back
              </Button>
            )}
            
            {isLastModule ? (
              <Button 
                className="flex-1 bg-green-600 hover:bg-green-700" 
                onClick={handleSignIn}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in..." : "Sign In"}
              </Button>
            ) : (
              <Button 
                className="flex-1" 
                onClick={() => setCurrentModuleIndex(prev => prev + 1)}
              >
                Next
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
