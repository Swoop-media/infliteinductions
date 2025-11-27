// @ts-nocheck
// app/app/creator/operations-notices/[id]/delete/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

async function deleteNoticeAction(formData: FormData) {
  "use server";
  
  const canAccess =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    redirect("/app/home?banner=not_authorised");
  }

  const noticeId = String(formData.get("notice_id") || "");
  if (!noticeId) throw new Error("Missing notice_id");

  const supabase = await createSupabaseServer();
  
  const { error } = await supabase
    .from("operations_notices")
    .delete()
    .eq("id", noticeId);

  if (error) {
    redirect(`/app/creator/operations-notices/${noticeId}/delete?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/creator");
  redirect("/app/creator?tab=operations-notices&ok=notice_deleted");
}

export default async function DeleteNoticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  
  const canAccess =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    redirect("/app/home?banner=not_authorised");
  }

  const supabase = await createSupabaseServer();
  
  const { data: notice, error } = await supabase
    .from("operations_notices")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();

  if (error || !notice) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Delete Notice</h1>
        <p className="text-red-600">Notice not found</p>
        <Link href="/app/creator?tab=operations-notices" className="underline">Back</Link>
      </div>
    );
  }

  const sp = await (searchParams ?? Promise.resolve({}));
  const errorMsg = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Delete Operations Notice</h1>
      
      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {decodeURIComponent(errorMsg)}
        </div>
      )}
      
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">
          Are you sure you want to delete the notice <strong>"{notice.title}"</strong>?
        </p>
        <p className="text-sm text-red-600 mt-2">
          This action cannot be undone. All assignments and acknowledgements will also be deleted.
        </p>
      </div>

      <form action={deleteNoticeAction} className="flex gap-3">
        <input type="hidden" name="notice_id" value={id} />
        <Link
          href={`/app/creator/operations-notices/${id}`}
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          Delete Notice
        </button>
      </form>
    </div>
  );
}
