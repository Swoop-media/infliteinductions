// @ts-nocheck

import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BookOpen, ArrowLeft, User } from "lucide-react";
import Link from "next/link";
import ModuleList from "./ModuleList";
import { unstable_cache } from "next/cache";

type PageParams = { params: { id: string } };

const getCourseMetaCached = unstable_cache(
  async (svc: ReturnType<typeof supabaseAdmin>, courseId: string) => {
    const { data, error } = await svc.rpc("get_course_meta", { p_course_id: courseId });
    if (error || !data) throw error ?? new Error("No course meta");
    return data as {
      course: any;
      modules: any[];
      requirements: any[];
    };
  },
  // cache key seed (Next will also hash args)
  ["course-meta"],
  {
    revalidate: 60,
    tags: [`course-meta`], // Simplified tags to fix undefined warning
  }
);

export default async function CoursePage({ params }: PageParams) {
  const { id: courseId } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = supabaseAdmin();

  // Stream: fetch meta first (cacheable) so header renders quickly.
  const meta = await getCourseMetaCached(svc, courseId);
  const { course, modules, requirements } = meta;

  if (!course) redirect("/app/train-assess");

  // Basic counts are derived from state, but we’ll show a loading skeleton first.
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/app/train-assess" className="inline-flex items-center text-sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to training
        </Link>
      </div>

      <Card className="border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {course.title}
            <Badge variant="secondary" className="ml-2">
              {/* Session type comes from assignment; placeholder until state loads */}
              loading…
            </Badge>
          </CardTitle>
          {course.description ? <CardDescription>{course.description}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <User className="h-4 w-4" />
            <div className="text-sm">
              <div className="font-medium">Loading trainee…</div>
              <div className="text-muted-foreground">Loading…</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Overall progress</span>
              <span className="text-sm font-medium">…%</span>
            </div>
            <Progress value={0} />
          </div>
        </CardContent>
      </Card>

      {/* Stream the user-specific state & module UI */}
      <Suspense
        fallback={
          <div className="grid gap-4">
            {Array.from({ length: Math.max(modules.length, 2) }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg border animate-pulse" />
            ))}
          </div>
        }
      >
        <ModuleList
          courseId={courseId}
          trainerId={user.id}
          modules={modules}
          requirementDefinitions={requirements}
        />
      </Suspense>
    </div>
  );
}
