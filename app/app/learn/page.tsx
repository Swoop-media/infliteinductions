// app/app/learn/page.tsx
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LearnHome() {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">My Learning & Profile</h1>
        <p className="text-red-600">Please sign in.</p>
        <Link href="/auth/login" className="text-blue-600 underline">
          Go to login
        </Link>
      </div>
    );
  }

  // Show ALL enrolments for the current user (pending or approved)
  const { data: enrols, error } = await supabase
    .from("enrolments")
    .select(
      `
      id,
      status,
      created_at,
      approved_at,
      course:courses (
        id,
        title,
        description,
        status
      )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">My Learning & Profile</h1>
        <p className="rounded-md bg-red-50 p-3 text-red-700">
          Couldn’t load your enrolments: {error.message}
        </p>
        <Link href="/app" className="text-blue-600 underline">
          Back to home
        </Link>
      </div>
    );
  }

  const items = enrols ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Learning & Profile</h1>
        <Link href="/app" className="rounded-md border px-3 py-1 text-sm">
          Home
        </Link>
      </div>

      <h2 className="text-lg font-medium">Your Courses</h2>

      {items.length === 0 ? (
        <div className="rounded-xl border p-4 text-gray-600">
          You don’t have any courses yet.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {items.map((e: any) => {
            const course = e.course || {};
            const canStart =
              e.status === "approved" && course.status !== "archived";
            const courseTitle = course.title ?? "Untitled course";
            const courseDesc = course.description ?? "No description";

            return (
              <li key={e.id} className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <div className="truncate text-lg font-medium">
                    {courseTitle}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-gray-600">
                    {courseDesc}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                    <span className="rounded bg-gray-100 px-2 py-0.5">
                      Enrolment: {e.status}
                    </span>
                    {course.status && (
                      <span className="rounded bg-gray-100 px-2 py-0.5">
                        Course: {course.status}
                      </span>
                    )}
                    {e.approved_at && (
                      <span className="rounded bg-gray-100 px-2 py-0.5">
                        Approved: {new Date(e.approved_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  {canStart ? (
                    <Link
                      href={`/app/creator/courses/${course.id}/test`}
                      className="rounded-md bg-black px-3 py-2 text-sm text-white"
                    >
                      Start
                    </Link>
                  ) : e.status === "pending" ? (
                    <span className="rounded-md border px-3 py-2 text-sm text-gray-700">
                      Pending approval
                    </span>
                  ) : (
                    <span className="rounded-md border px-3 py-2 text-sm text-gray-700">
                      Unavailable
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}