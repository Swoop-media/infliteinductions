// @ts-nocheck
// app/app/creator/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import DeleteAuthorisationButton from "./_components/DeleteAuthorisationButton";
import FilteredCourseList from "./_components/FilteredCourseList";

type CourseRow = {
  id: string;
  title: string | null;
  status: "draft" | "published" | "archived";
  updated_at: string;
  created_at: string;
  tags: string[] | null;
  department: string | null;
};

type AuthzRow = {
  id: string;
  title: string | null;
  status: "draft" | "active" | "archived";
  updated_at: string;
  created_at: string;
};

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "amber" | "gray";
}) {
  const tones: Record<string, string> = {
    default: "bg-gray-100 text-gray-800",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    gray: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function statusTone(status: CourseRow["status"] | AuthzRow["status"]) {
  switch (status) {
    case "published":
    case "active":
      return "green";
    case "draft":
      return "gray";
    case "archived":
      return "amber";
    default:
      return "default";
  }
}

// Server Action for duplicating courses
async function duplicateCourseAction(formData: FormData) {
  "use server";
  
  const supabase = await createSupabaseServer();
  
  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  const originalCourseId = formData.get('courseId') as string;
  if (!originalCourseId) {
    redirect("/app/creator?error=no_course_id");
  }

  try {
    // Fetch the original course with all details
    const { data: originalCourse, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', originalCourseId)
      .single();

    if (courseError || !originalCourse) {
      redirect("/app/creator?error=course_not_found");
    }

    // Create the new course with all original properties
    const newCourseTitle = `Copy of ${originalCourse.title}`;
    const { data: newCourse, error: newCourseError } = await supabase
      .from('courses')
      .insert({
        title: newCourseTitle,
        description: originalCourse.description,
        status: 'draft',
        valid_for_days: originalCourse.valid_for_days,
        retake_reminder_days: originalCourse.retake_reminder_days,
        notification_lead_days: originalCourse.notification_lead_days,
        department: originalCourse.department,
        tags: originalCourse.tags,
        external_contractors: originalCourse.external_contractors,
        created_by: user.id
      })
      .select('id')
      .single();

    if (newCourseError) {
      redirect("/app/creator?error=failed_to_create_course");
    }

    // Get all modules from the original course
    const { data: originalModules, error: modulesError } = await supabase
      .from('course_modules')
      .select('*')
      .eq('course_id', originalCourseId)
      .order('type', { ascending: true })
      .order('order_index', { ascending: true });

    if (modulesError) {
      console.error('Error fetching original modules:', modulesError);
      redirect("/app/creator?error=failed_to_fetch_modules");
    }

    // Copy each module and its content
    for (const originalModule of originalModules || []) {
      // Create new module
      const { data: newModule, error: moduleError } = await supabase
        .from('course_modules')
        .insert({
          course_id: newCourse.id,
          type: originalModule.type,
          title: originalModule.title,
          order_index: originalModule.order_index
        })
        .select('id')
        .single();

      if (moduleError) {
        console.error('Error creating new module:', moduleError);
        continue;
      }

      // Copy module content blocks
      const { data: originalBlocks, error: blocksError } = await supabase
        .from('module_content_blocks')
        .select('*')
        .eq('module_id', originalModule.id)
        .order('order_index', { ascending: true });

      if (!blocksError && originalBlocks?.length > 0) {
        const newBlocks = originalBlocks.map(block => ({
          module_id: newModule.id,
          kind: block.kind,
          data: block.data,
          order_index: block.order_index
        }));

        await supabase.from('module_content_blocks').insert(newBlocks);
      }

      // If this is a quiz module, copy quiz data
      if (originalModule.type === 'digital_assessment_quiz') {
        // Copy quiz settings
        const { data: originalQuiz, error: quizError } = await supabase
          .from('quizzes')
          .select('*')
          .eq('module_id', originalModule.id)
          .single();

        if (!quizError && originalQuiz) {
          const { data: newQuiz, error: newQuizError } = await supabase
            .from('quizzes')
            .insert({
              course_id: newCourse.id,
              module_id: newModule.id,
              pass_mark: originalQuiz.pass_mark,
              max_attempts: originalQuiz.max_attempts,
              shuffle: originalQuiz.shuffle,
              show_feedback: originalQuiz.show_feedback
            })
            .select('id')
            .single();

          if (!newQuizError) {
            // Copy quiz questions
            const { data: originalQuestions, error: questionsError } = await supabase
              .from('quiz_questions')
              .select('*')
              .eq('quiz_id', originalQuiz.id)
              .order('order_index', { ascending: true });

            if (!questionsError && originalQuestions?.length > 0) {
              for (const originalQuestion of originalQuestions) {
                const { data: newQuestion, error: questionError } = await supabase
                  .from('quiz_questions')
                  .insert({
                    quiz_id: newQuiz.id,
                    module_id: newModule.id,
                    course_id: newCourse.id,
                    type: originalQuestion.type,
                    question: originalQuestion.question,
                    explanation: originalQuestion.explanation,
                    points: originalQuestion.points,
                    order_index: originalQuestion.order_index
                  })
                  .select('id')
                  .single();

                if (!questionError) {
                  // Copy quiz options for this question
                  const { data: originalOptions, error: optionsError } = await supabase
                    .from('quiz_options')
                    .select('*')
                    .eq('question_id', originalQuestion.id)
                    .order('order_index', { ascending: true });

                  if (!optionsError && originalOptions?.length > 0) {
                    const newOptions = originalOptions.map(option => ({
                      question_id: newQuestion.id,
                      text: option.text,
                      correct: option.correct,
                      order_index: option.order_index
                    }));

                    await supabase.from('quiz_options').insert(newOptions);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Revalidate and redirect to the new course editor
    revalidatePath("/app/creator");
    redirect(`/app/creator/courses/${newCourse.id}?notice=course_duplicated`);

  } catch (error) {
    console.error('Error during course duplication:', error);
    redirect("/app/creator?error=duplication_failed");
  }
}

function FlashBanner({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (ok) {
    const msg =
      ok === "course_deleted"
        ? "Course deleted."
        : ok === "authorisation_deleted"
        ? "Authorisation deleted."
        : ok === "course_duplicated"
        ? "Course duplicated successfully."
        : "Saved.";
    return (
      <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
        {msg}
      </div>
    );
  }
  return null;
}

export default async function CreatorHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Guard: redirect unauthorized users to Home with banner
  const canAccess =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    redirect("/app/home?banner=no_access");
  }

  const sp = await searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) === "authorisations" ? "authorisations" : "courses";
  const ok = (Array.isArray(sp.ok) ? sp.ok[0] : sp.ok) ?? null;
  const error = (Array.isArray(sp.error) ? sp.error[0] : sp.error) ?? null;

  const supabase = await createSupabaseServer();

  const [{ data: courses = [] as CourseRow[] }, { data: authzs = [] as AuthzRow[] }] =
    await Promise.all([
      supabase
        .from("courses")
        .select("id,title,status,updated_at,created_at,tags,department")
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("authorisations")
        .select("id,title,status,updated_at,created_at")
        .order("updated_at", { ascending: false })
        .limit(25),
    ]);

  return (
    <div className="space-y-8">
      <FlashBanner ok={ok} error={error} />

      {/* Tab switcher */}
      <div className="flex items-center gap-2">
        <Link
          href="/app/creator?tab=courses"
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "courses" ? "bg-black text-white" : "border border-gray-200 hover:bg-gray-100"
          }`}
        >
          Courses
        </Link>
        <Link
          href="/app/creator?tab=authorisations"
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "authorisations" ? "bg-black text-white" : "border border-gray-200 hover:bg-gray-100"
          }`}
        >
          Authorisations
        </Link>
      </div>

      {tab === "courses" ? (
        <FilteredCourseList 
          courses={courses} 
          duplicateCourseAction={duplicateCourseAction}
        />
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Authorisations</h2>
            <Link
              href="/app/creator/authorisations/new"
              className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Create Authorisation
            </Link>
          </div>

          {authzs.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No authorisations yet. Click <span className="font-medium">Create Authorisation</span> to add one.
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {authzs.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/app/creator/authorisations/${a.id}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {a.title || "Untitled"}
                      </Link>
                      <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      Updated {new Date(a.updated_at || a.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/app/creator/authorisations/${a.id}`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                      Edit
                    </Link>
                    <DeleteAuthorisationButton authId={a.id} title={a.title ?? undefined} />
                    <Link
                      href={`/app/creator/authorisations/${a.id}?tab=assignments`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                      Assign
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
