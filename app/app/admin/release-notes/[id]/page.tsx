// @ts-nocheck
import Link from "next/link";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

const MAX_TITLE = 200;
const MAX_DETAILS = 10000;

function releasePath(id: string, message?: string, isError = false) {
  if (!message) return `/app/admin/release-notes/${id}`;
  return `/app/admin/release-notes/${id}?${isError ? "error" : "notice"}=${encodeURIComponent(message)}`;
}

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

async function requireAdmin() {
  if (!(await hasRole("Admin"))) redirect("/app/home?banner=no_access");
}

function cleanText(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

async function getReleaseForAction(id: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("release_notes")
    .select("id, status, title, release_date, published_at")
    .eq("id", id)
    .maybeSingle();
  return { supabase, release: data, error };
}

async function updateReleaseAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = cleanText(formData, "release_id", 100);
  const title = cleanText(formData, "title", MAX_TITLE);
  const releaseDate = cleanText(formData, "release_date", 10);
  if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    redirect(releasePath(id, "Enter a release title and valid release date.", true));
  }

  const { supabase, release } = await getReleaseForAction(id);
  if (!release) redirect("/app/admin/release-notes?error=Release+not+found.");
  if (release.status !== "draft") {
    redirect(releasePath(id, "Published and archived releases cannot be edited. Change the status to draft first.", true));
  }

  const { error } = await supabase.from("release_notes").update({ title, release_date: releaseDate }).eq("id", id);
  if (error) redirect(releasePath(id, error.message, true));

  revalidatePath("/app/admin/release-notes");
  revalidatePath(`/app/admin/release-notes/${id}`);
  redirect(releasePath(id, "Release details saved."));
}

async function addItemAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = cleanText(formData, "release_id", 100);
  const title = cleanText(formData, "title", MAX_TITLE);
  const location = cleanText(formData, "location", MAX_TITLE);
  const details = cleanText(formData, "details", MAX_DETAILS);
  if (!id || !title || !location || !details) {
    redirect(releasePath(id, "Each change needs a title, location, and detailed explanation.", true));
  }

  const { supabase, release } = await getReleaseForAction(id);
  if (!release) redirect("/app/admin/release-notes?error=Release+not+found.");
  if (release.status !== "draft") redirect(releasePath(id, "Only draft releases can be changed.", true));

  const { data: lastItem } = await supabase
    .from("release_note_items")
    .select("order_index")
    .eq("release_note_id", id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("release_note_items")
    .insert({ release_note_id: id, title, location, details, order_index: (lastItem?.order_index ?? -1) + 1 });
  if (error) redirect(releasePath(id, error.message, true));

  revalidatePath(`/app/admin/release-notes/${id}`);
  redirect(releasePath(id, "Change added."));
}

async function updateItemAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = cleanText(formData, "release_id", 100);
  const itemId = cleanText(formData, "item_id", 100);
  const title = cleanText(formData, "title", MAX_TITLE);
  const location = cleanText(formData, "location", MAX_TITLE);
  const details = cleanText(formData, "details", MAX_DETAILS);
  if (!id || !itemId || !title || !location || !details) {
    redirect(releasePath(id, "Each change needs a title, location, and detailed explanation.", true));
  }

  const { supabase, release } = await getReleaseForAction(id);
  if (!release) redirect("/app/admin/release-notes?error=Release+not+found.");
  if (release.status !== "draft") redirect(releasePath(id, "Only draft releases can be changed.", true));

  const { error } = await supabase
    .from("release_note_items")
    .update({ title, location, details })
    .eq("id", itemId)
    .eq("release_note_id", id);
  if (error) redirect(releasePath(id, error.message, true));

  revalidatePath(`/app/admin/release-notes/${id}`);
  redirect(releasePath(id, "Change saved."));
}

async function deleteItemAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = cleanText(formData, "release_id", 100);
  const itemId = cleanText(formData, "item_id", 100);
  const { supabase, release } = await getReleaseForAction(id);
  if (!release) redirect("/app/admin/release-notes?error=Release+not+found.");
  if (release.status !== "draft") redirect(releasePath(id, "Only draft releases can be changed.", true));

  const { error } = await supabase.from("release_note_items").delete().eq("id", itemId).eq("release_note_id", id);
  if (error) redirect(releasePath(id, error.message, true));

  revalidatePath(`/app/admin/release-notes/${id}`);
  redirect(releasePath(id, "Change removed."));
}

async function moveItemAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = cleanText(formData, "release_id", 100);
  const itemId = cleanText(formData, "item_id", 100);
  const direction = cleanText(formData, "direction", 4);
  if (!id || !itemId || !["up", "down"].includes(direction)) {
    redirect(releasePath(id, "Unable to reorder this change.", true));
  }

  const { supabase, release } = await getReleaseForAction(id);
  if (!release) redirect("/app/admin/release-notes?error=Release+not+found.");
  if (release.status !== "draft") redirect(releasePath(id, "Only draft releases can be changed.", true));

  const { data: items, error: itemsError } = await supabase
    .from("release_note_items")
    .select("id, order_index, created_at")
    .eq("release_note_id", id)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (itemsError) redirect(releasePath(id, itemsError.message, true));

  const currentIndex = (items ?? []).findIndex((item) => item.id === itemId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= (items?.length ?? 0)) {
    redirect(releasePath(id, "That change is already at the edge of the list.", true));
  }

  const reordered = [...items];
  [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
  const offset = (items?.length ?? 0) + 10;
  for (let index = 0; index < reordered.length; index += 1) {
    const { error } = await supabase.from("release_note_items").update({ order_index: offset + index }).eq("id", reordered[index].id);
    if (error) redirect(releasePath(id, error.message, true));
  }
  for (let index = 0; index < reordered.length; index += 1) {
    const { error } = await supabase.from("release_note_items").update({ order_index: index }).eq("id", reordered[index].id);
    if (error) redirect(releasePath(id, error.message, true));
  }

  revalidatePath(`/app/admin/release-notes/${id}`);
  redirect(releasePath(id, "Change order updated."));
}

async function updateStatusAction(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = cleanText(formData, "release_id", 100);
  const status = cleanText(formData, "status", 10);
  if (!id || !["draft", "published", "archived"].includes(status)) {
    redirect(releasePath(id, "Choose a valid release status.", true));
  }

  const { supabase, release } = await getReleaseForAction(id);
  if (!release) redirect("/app/admin/release-notes?error=Release+not+found.");

  if (status === "published") {
    const { data: items, error: itemsError } = await supabase
      .from("release_note_items")
      .select("id, title, location, details")
      .eq("release_note_id", id);
    if (itemsError) redirect(releasePath(id, itemsError.message, true));
    if (!items?.length || items.some((item) => !item.title?.trim() || !item.location?.trim() || !item.details?.trim())) {
      redirect(releasePath(id, "Add at least one complete change before publishing.", true));
    }
  }

  const { error } = await supabase.from("release_notes").update({ status }).eq("id", id);
  if (error) redirect(releasePath(id, error.message, true));

  revalidatePath("/app/admin/release-notes");
  revalidatePath(`/app/admin/release-notes/${id}`);
  revalidatePath("/app/release-notes");
  redirect(releasePath(id, status === "published" ? "Release published." : `Release marked ${status}.`));
}

export default async function AdminReleaseNoteEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  noStore();
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const [{ data: release, error: releaseError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("release_notes")
      .select("id, title, release_date, status, published_at, created_at, updated_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("release_note_items")
      .select("id, release_note_id, order_index, title, location, details, created_at")
      .eq("release_note_id", id)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  if (releaseError || !release) notFound();

  const sp = await (searchParams ?? Promise.resolve({}));
  const notice = readParam(sp.notice);
  const error = readParam(sp.error) || (itemsError ? "Changes could not be loaded. Please refresh and try again." : null);
  const editable = release.status === "draft";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/app/admin/release-notes" className="text-sm font-medium text-blue-700 hover:underline">
            ← All release notes
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-950">{release.title}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyle(release.status)}`}>
              {release.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Release date: {new Date(`${release.release_date}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
            {release.published_at ? ` · Published ${new Date(release.published_at).toLocaleString("en-AU")}` : ""}
          </p>
        </div>
        {release.status === "published" && (
          <Link href="/app/release-notes" target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
            Open published history
          </Link>
        )}
      </div>

      {notice && (
        <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">Release status</h2>
        <p className="mt-1 text-sm text-gray-600">
          Only published releases are visible to ordinary users. Publishing requires at least one complete change.
        </p>
        <form action={updateStatusAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="release_id" value={release.id} />
          <label className="grid gap-1.5 text-sm font-medium">
            Status
            <select name="status" defaultValue={release.status} className="rounded-md border px-3 py-2">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50">Update status</button>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">Release details</h2>
        {!editable && (
          <p className="mt-1 text-sm text-amber-700">
            Change the release back to draft to edit its title, date, or change list.
          </p>
        )}
        <form action={updateReleaseAction} className="mt-4 grid gap-4 md:grid-cols-[1fr_190px_auto] md:items-end">
          <input type="hidden" name="release_id" value={release.id} />
          <label className="grid gap-1.5 text-sm font-medium">
            Release title
            <input name="title" required maxLength={MAX_TITLE} defaultValue={release.title} disabled={!editable} className="rounded-md border px-3 py-2 disabled:bg-gray-100" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Release date
            <input name="release_date" type="date" required defaultValue={release.release_date} disabled={!editable} className="rounded-md border px-3 py-2 disabled:bg-gray-100" />
          </label>
          <button disabled={!editable} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-400">
            Save details
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">Change list</h2>
          <p className="mt-1 text-sm text-gray-600">
            Each entry explains where the change occurred and the full detail users need.
          </p>
        </div>

        {(items ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed bg-gray-50 p-7 text-center text-sm text-gray-600">
            No changes added yet. Add at least one complete change before publishing.
          </div>
        ) : (
          <ol className="space-y-4">
            {(items ?? []).map((item, index) => (
              <li key={item.id} className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-gray-700">Change {index + 1}</span>
                  {editable && (
                    <div className="flex flex-wrap gap-2">
                      <form action={moveItemAction}>
                        <input type="hidden" name="release_id" value={release.id} />
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button disabled={index === 0} className="rounded-md border px-2.5 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Move up</button>
                      </form>
                      <form action={moveItemAction}>
                        <input type="hidden" name="release_id" value={release.id} />
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button disabled={index === items.length - 1} className="rounded-md border px-2.5 py-1 text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Move down</button>
                      </form>
                    </div>
                  )}
                </div>
                <form action={updateItemAction} className="grid gap-4">
                  <input type="hidden" name="release_id" value={release.id} />
                  <input type="hidden" name="item_id" value={item.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-medium">
                      Change title
                      <input name="title" required maxLength={MAX_TITLE} defaultValue={item.title} disabled={!editable} className="rounded-md border px-3 py-2 disabled:bg-gray-100" />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      Where in the app
                      <input name="location" required maxLength={MAX_TITLE} defaultValue={item.location} disabled={!editable} className="rounded-md border px-3 py-2 disabled:bg-gray-100" />
                    </label>
                  </div>
                  <label className="grid gap-1.5 text-sm font-medium">
                    What changed
                    <textarea name="details" required maxLength={MAX_DETAILS} rows={5} defaultValue={item.details} disabled={!editable} className="resize-y rounded-md border px-3 py-2 leading-6 disabled:bg-gray-100" />
                  </label>
                  {editable && (
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800">Save change</button>
                      <button formAction={deleteItemAction} className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                        Remove change
                      </button>
                    </div>
                  )}
                </form>
              </li>
            ))}
          </ol>
        )}

        {editable && (
          <form action={addItemAction} className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <h3 className="font-semibold text-gray-950">Add a change</h3>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Change title
                  <input name="title" required maxLength={MAX_TITLE} placeholder="e.g. Faster document uploads" className="rounded-md border bg-white px-3 py-2" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Where in the app
                  <input name="location" required maxLength={MAX_TITLE} placeholder="e.g. My Profile → Documents" className="rounded-md border bg-white px-3 py-2" />
                </label>
              </div>
              <input type="hidden" name="release_id" value={release.id} />
              <label className="grid gap-1.5 text-sm font-medium">
                What changed
                <textarea name="details" required maxLength={MAX_DETAILS} rows={5} placeholder="Describe the improvement, new behavior, or issue fixed." className="resize-y rounded-md border bg-white px-3 py-2 leading-6" />
              </label>
              <div><button className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">Add change</button></div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}