import { createSupabaseServer } from "@/lib/supabase/server";
import CourseEnrolButton from "@/components/CourseEnrolButton";

async function getCoursesAndEnrolments() {
  const supabase = createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      userId: null,
      courses: [],
      enrolmentsMap: new Map<string, string>(),
    };

  const { data: courses } = await supabase
    .from("courses")
    .select("id, title, updated_at, active")
    .eq("active", true)
    .order("updated_at", { ascending: false });

  const { data: enrolments } = await supabase
    .from("course_enrolments")
    .select("course_id, status")
    .eq("user_id", user.id);

  const enrolmentsMap = new Map<string, string>();
  (enrolments ?? []).forEach((e) => enrolmentsMap.set(e.course_id, e.status));

  return {
    userId: user.id,
    courses: courses ?? [],
    enrolmentsMap,
  };
}

export default async function CoursesPage() {
  const { courses, enrolmentsMap } = await getCoursesAndEnrolments();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Courses & Authorisations</h1>

      {courses.length === 0 ? (
        <div className="rounded-md border bg-white p-4 text-sm text-gray-600">
          No active courses yet. Creators/Admin can add courses in the Creator section.
        </div>
      ) : (
        <ul className="space-y-2">
          {courses.map((c: any) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border bg-white p-3"
            >
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-gray-500">
                  Updated {new Date(c.updated_at).toLocaleString()}
                </div>
              </div>

              <CourseEnrolButton
                courseId={c.id}
                initialStatus={(enrolmentsMap.get(c.id) as any) ?? null}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
