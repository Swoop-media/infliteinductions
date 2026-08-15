// @ts-nocheck
// POST /api/courses/[courseId]/suggest-metadata
//
// Creator-only endpoint: builds the course content corpus, generates a
// title/description/tags suggestion (AI when OPENAI_API_KEY is set,
// extractive fallback otherwise), stores it with the corpus hash for change
// detection, and returns it. Never saves anything to the course itself —
// the existing Details form save is the only persistence path.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import {
  buildCourseCorpus,
  generateSuggestion,
  storeSuggestion,
} from "@/lib/course-suggestions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;

  // Auth + creator-role gate (server-side; service-role writes bypass RLS
  // so the auth check alone is not enough).
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const canAccess =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const { data: course, error: cErr } = await supabaseAdmin()
    .from("courses")
    .select("id, title, description, department, tags")
    .eq("id", courseId)
    .maybeSingle();
  if (cErr || !course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  try {
    const corpus = await buildCourseCorpus(courseId);
    const suggestion = await generateSuggestion(corpus, {
      title: course.title,
      description: course.description,
      department: course.department,
      tags: course.tags,
    });
    await storeSuggestion(courseId, corpus.hash, suggestion, user.id);

    return NextResponse.json({
      suggestion: {
        title: suggestion.title,
        description: suggestion.description,
        tags: suggestion.tags,
        source: suggestion.source,
      },
      contentHash: corpus.hash,
      stats: {
        modules: corpus.moduleCount,
        blocks: corpus.blockCount,
        questions: corpus.questionCount,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to generate suggestion" },
      { status: 400 }
    );
  }
}
