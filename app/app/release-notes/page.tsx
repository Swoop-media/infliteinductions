// @ts-nocheck
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadPublishedReleaseNotes() {
  noStore();
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/auth/login");

  const releases: any[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error: releasesError } = await supabase
      .from("release_notes")
      .select("id, title, release_date, published_at, created_at")
      .eq("status", "published")
      .order("release_date", { ascending: false })
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (releasesError) {
      return { releases: [], error: "We could not load release notes. Please try again shortly." };
    }
    releases.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  const releaseIds = releases.map((release) => release.id);
  if (releaseIds.length === 0) return { releases: [], error: null };

  const items: any[] = [];
  for (let start = 0; start < releaseIds.length; start += 100) {
    const chunk = releaseIds.slice(start, start + 100);
    const itemPageSize = 500;
    for (let offset = 0; ; offset += itemPageSize) {
      const { data, error: itemsError } = await supabase
        .from("release_note_items")
        .select("id, release_note_id, order_index, title, location, details, created_at")
        .in("release_note_id", chunk)
        .order("release_note_id", { ascending: true })
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + itemPageSize - 1);

      if (itemsError) {
        return { releases: [], error: "We could not load the release note details. Please try again shortly." };
      }
      items.push(...(data ?? []));
      if (!data || data.length < itemPageSize) break;
    }
  }

  const itemsByRelease = new Map<string, any[]>();
  for (const item of items) {
    const releaseItems = itemsByRelease.get(item.release_note_id) ?? [];
    releaseItems.push(item);
    itemsByRelease.set(item.release_note_id, releaseItems);
  }

  return {
    error: null,
    releases: releases.map((release) => ({
      ...release,
      items: itemsByRelease.get(release.id) ?? [],
    })),
  };
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export default async function ReleaseNotesPage() {
  const { releases, error } = await loadPublishedReleaseNotes();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="border-b pb-5">
        <p className="text-sm font-medium text-blue-700">Product updates</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">Release Notes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          A history of improvements and changes to the training platform.
        </p>
      </header>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {error}
        </div>
      ) : releases.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-gray-50 p-10 text-center">
          <h2 className="font-semibold text-gray-900">No release notes yet</h2>
          <p className="mt-2 text-sm text-gray-600">
            Published updates will appear here when they are available.
          </p>
        </div>
      ) : (
        <ol className="relative ml-2 space-y-8 border-l border-blue-200 pl-6 sm:ml-4 sm:pl-8">
          {releases.map((release) => (
            <li key={release.id} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[33px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600 sm:-left-[41px]"
              />
              <article className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
                <time className="text-sm font-medium text-blue-700" dateTime={release.release_date}>
                  {formatDate(release.release_date)}
                </time>
                <h2 className="mt-1 text-xl font-bold text-gray-950">{release.title}</h2>

                <ol className="mt-5 space-y-4">
                  {release.items.map((item, index) => (
                    <li key={item.id} className="rounded-lg bg-gray-50 p-4">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {index + 1}. Where
                        </span>
                        <span className="text-sm font-semibold text-gray-900">{item.location}</span>
                      </div>
                      <h3 className="mt-2 font-semibold text-gray-950">{item.title}</h3>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">
                        {item.details}
                      </p>
                    </li>
                  ))}
                </ol>
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}