"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

interface CourseModule {
  id: string;
  title: string;
  content: string;
  video_url?: string;
  order: number;
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
            (a: any, b: any) => (a.order || 0) - (b.order || 0)
          );
          setModules(sortedModules);
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
            <CardDescription>Complete the induction to sign in</CardDescription>
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
            <h3 className="text-xl font-semibold mb-3">{currentModule.title}</h3>
            
            {currentModule.video_url && (
              <div className="mb-4 aspect-video">
                <iframe
                  src={currentModule.video_url}
                  className="w-full h-full rounded-lg"
                  allowFullScreen
                />
              </div>
            )}
            
            <div 
              className="prose max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: currentModule.content || "" }}
            />
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
