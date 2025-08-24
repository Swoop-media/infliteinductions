import { createSupabaseServer } from "@/lib/supabase/server";
import CourseEnrolButton from "@/components/CourseEnrolButton";

async function getCoursesAndEnrolments() {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      userId: null,
      courses: [] as Array<{ id: string; title: string; updated_at: string }>,
      enrolmentsMap: new Map<string, string>(),
    };
  }

  // Show only published courses in the catalogue
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title, updated_at, status")
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  // Get all enrolments for this user (we’ll normalize below)
  const { data: enrolments } = await supabase
    .from("course_enrolments")
    .select("course_id, status")
    .eq("user_id", user.id);

  const enrolmentsMap = new Map<string, string>();
  (enrolments ?? []).forEach((e) => enrolmentsMap.set(e.course_id, e.status));

  return {
    userId: user.id,
    courses:
      (courses ?? []).map((c) => ({
        id: c.id,
        title: c.title ?? "Untitled",
        updated_at: c.updated_at as string,
      })) ?? [],
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
          No published courses yet. Creators/Admin can add courses in the Creator section.
        </div>
      ) : (
        <ul className="space-y-2">
          {courses.map((c) => {
            const raw = enrolmentsMap.get(c.id) ?? null;
            // 🔑 Only treat these as “enrolled”
            const initialStatus =
              raw === "approved" || raw === "in_progress" ? raw : null;

            return (
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

                {/* If you want the button to show “Requested” when raw === "pending",
                   extend CourseEnrolButton to accept a `rawStatus` prop and pass it here. */}
                <CourseEnrolButton
                  courseId={c.id}
                  initialStatus={initialStatus}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
