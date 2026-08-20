// @ts-nocheck
import Link from "next/link";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusStyle(status: string) {
  return status === "published"
    ? "bg-green-100 text-green-800"
    : status === "archived"
      ? "bg-gray-200 text-gray-700"
      : "bg-amber-100 text-amber-800";
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

async function requireAdmin() {
  if (!(await hasRole("Admin"))) redirect("/app/home?banner=no_access");
}

async function createReleaseAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const releaseDate = String(formData.get("release_date") ?? "").trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    redirect("/app/admin/release-notes?error=Enter+a+release+title+and+valid+release+date.");
  }

  const { data, error } = await supabase
    .from("release_notes")
    .insert({ title, release_date: releaseDate, status: "draft", created_by: user.id })
    .select("id")
    .single();

  if (error || !data?.id) {
    redirect(`/app/admin/release-notes?error=${encodeURIComponent(error?.message ?? "Unable to create release draft.")}`);
  }

  revalidatePath("/app/admin/release-notes");
  redirect(`/app/admin/release-notes/${data.id}?notice=created`);
}

export default async function AdminReleaseNotesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  noStore();
  const supabase = await createSupabaseServer();
  const sp = await (searchParams ?? Promise.resolve({}));
  const error = readParam(sp.error);

  const releases: any[] = [];
  let loadError: any = null;
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error: pageError } = await supabase
      .from("release_notes")
      .select("id, title, release_date, status, published_at, updated_at")
      .order("release_date", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (pageError) {
      loadError = pageError;
      break;
    }
    releases.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">Admin Centre</p>
          <h1 className="text-2xl font-bold text-gray-950">Release Notes</h1>
          <p className="mt-1 text-sm text-gray-600">
            Create drafts, add structured changes, and publish complete platform updates.
          </p>
        </div>
        <Link href="/app/admin" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
          Back to Admin
        </Link>
      </div>

      {(error || loadError) && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error || "Release notes could not be loaded. Please refresh and try again."}
        </div>
      )}

      <form action={createReleaseAction} className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-950">Create a release draft</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_190px_auto] md:items-end">
          <label className="grid gap-1.5 text-sm font-medium text-gray-800">
            Release title
            <input
              name="title"
              required
              maxLength={200}
              placeholder="e.g. August platform improvements"
              className="rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-gray-800">
            Release date
            <input name="release_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-md border px-3 py-2 text-sm" />
          </label>
          <button className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
            Create draft
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-950">All releases</h2>
          <span className="text-sm text-gray-500">{releases.length} total</span>
        </div>
        {!loadError && releases.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-gray-50 p-8 text-center text-sm text-gray-600">
            No release drafts or published notes yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">
            <ul className="divide-y">
              {releases.map((release) => (
                <li key={release.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-950">{release.title}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyle(release.status)}`}>
                        {release.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatDate(release.release_date)}
                      {release.published_at ? ` · Published ${new Date(release.published_at).toLocaleDateString("en-AU")}` : ""}
                    </p>
                  </div>
                  <Link href={`/app/admin/release-notes/${release.id}`} className="self-start rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50 sm:self-auto">
                    {release.status === "draft" ? "Edit draft" : "View release"}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}