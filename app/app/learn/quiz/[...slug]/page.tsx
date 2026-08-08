// Legacy quiz player retired. This stub only redirects old
// /app/learn/quiz/... links into the main course quiz flow.
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LegacyQuizRedirect(props: {
  params: Promise<{ slug: string[] }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { slug } = await props.params;
  const sp: SearchParams = (await (props.searchParams ?? Promise.resolve({}))) || {};
  const preview = (first(sp.preview) ?? "") === "1";

  // Old URL shapes:
  //   /app/learn/quiz/<moduleId or courseId>[?module=<moduleId>]
  //   /app/learn/quiz/modules/<moduleId>
  const id = slug[0] === "modules" ? slug[1] : slug[0];
  const candidate = first(sp.module) || id;

  if (!candidate) redirect("/app/courses");

  const supabase = await createSupabaseServer();

  // Try as module id first
  const { data: mod } = (await supabase
    .from("course_modules")
    .select("id, course_id")
    .eq("id", candidate)
    .maybeSingle()) as { data: { id: string; course_id: string } | null };

  if (mod) {
    redirect(
      `/app/learn/courses/${mod.course_id}?module=${mod.id}&quiz=start${preview ? "&preview=1" : ""}`
    );
  }

  // Fall back: treat as course id and resolve its quiz module so the link
  // still lands in the quiz flow (the legacy route accepted course ids too).
  const { data: course } = (await supabase
    .from("courses")
    .select("id")
    .eq("id", candidate)
    .maybeSingle()) as { data: { id: string } | null };

  if (course) {
    const { data: quizModules } = (await supabase
      .from("course_modules")
      .select("id, order_index")
      .eq("course_id", course.id)
      .eq("type", "digital_assessment_quiz")
      .order("order_index", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)) as { data: { id: string }[] | null };

    const quizModule = quizModules?.[0] ?? null;
    if (quizModule) {
      redirect(
        `/app/learn/courses/${course.id}?module=${quizModule.id}&quiz=start${preview ? "&preview=1" : ""}`
      );
    }
    redirect(`/app/learn/courses/${course.id}${preview ? "?preview=1" : ""}`);
  }

  redirect("/app/courses");
}
