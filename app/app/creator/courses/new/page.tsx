// @ts-nocheck
// app/app/creator/courses/new/page.tsx
/* Create Course (draft)
   Access: Course creators | Senior management | Admin
   Behavior: Title only → insert draft → redirect to Details tab
*/
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasRole } from "@/lib/roles";
import { createSupabaseServer } from "@/lib/supabase/server";
import { logContentAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function createCourseAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  // Guard inside action too
  const canAccess =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    redirect("/app/home?banner=not_authorised");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const title = String(formData.get("title") || "").trim().slice(0, 200);
  if (!title) {
    redirect("/app/creator/courses/new?error=Title+is+required");
  }

  // Insert draft course; store creator for downstream permissions
  const { data, error } = await supabase
    .from("courses")
    .insert({ title, status: "draft", created_by: user.id })
    .select("id")
    .single();

  if (error || !data?.id) {
    redirect(`/app/creator/courses/new?error=${encodeURIComponent(error?.message || "create_failed")}`);
  }

  const courseId = data.id as string;

  await logContentAudit({
    entityType: "course",
    entityId: courseId,
    entityName: title,
    action: "created",
    actorId: user.id,
  });

  // Revalidate the creator list and go straight to the editor (Details tab)
  revalidatePath("/app/creator");
  redirect(`/app/creator/courses/${courseId}?tab=details&notice=saved`);
}

export default async function NewCoursePage() {
  // Guard: only creators/SM/admin
  const canAccess =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    redirect("/app/home?banner=not_authorised");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Create Course</h2>
        <Link
          href="/app/creator?tab=courses"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>

      <form action={createCourseAction} className="space-y-6 rounded-lg border bg-white p-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Title *</label>
          <input
            name="title"
            required
            maxLength={200}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
            placeholder="e.g., Ground Safety Induction"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/app/creator?tab=courses"
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Create
          </button>
        </div>

        <p className="text-xs text-gray-500">
          After creating, you can add description, department, tags, modules, and quiz in the course editor (Details tab).
        </p>
      </form>
    </div>
  );
}
