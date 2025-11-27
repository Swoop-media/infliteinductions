// @ts-nocheck
// app/app/creator/operations-notices/new/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasRole } from "@/lib/roles";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function createNoticeAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

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
    redirect("/app/creator/operations-notices/new?error=Title+is+required");
  }

  const { data, error } = await supabase
    .from("operations_notices")
    .insert({ title, status: "draft", created_by: user.id })
    .select("id")
    .single();

  if (error || !data?.id) {
    redirect(`/app/creator/operations-notices/new?error=${encodeURIComponent(error?.message || "create_failed")}`);
  }

  const noticeId = data.id as string;

  revalidatePath("/app/creator");
  redirect(`/app/creator/operations-notices/${noticeId}?tab=details&notice=saved`);
}

export default async function NewOperationsNoticePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const canAccess =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    redirect("/app/home?banner=not_authorised");
  }

  const sp = await (searchParams ?? Promise.resolve({}));
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Create Operations Notice</h2>
        <Link
          href="/app/creator?tab=operations-notices"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(error)}
        </div>
      )}

      <form action={createNoticeAction} className="space-y-6 rounded-lg border bg-white p-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Title *</label>
          <input
            name="title"
            required
            maxLength={200}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring"
            placeholder="e.g., Safety Update - November 2025"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/app/creator?tab=operations-notices"
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
          After creating, you can add description, department, and configure acknowledgement settings in the notice editor (Details tab).
        </p>
      </form>
    </div>
  );
}
