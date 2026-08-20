// @ts-nocheck
// app/app/release-notes/page.tsx
//
// Loader strategy
// ───────────────
// PRIMARY  — rpc("get_published_release_notes_snapshot")
//   Returns one JSON array containing every published release and its nested
//   items from a single, consistent database statement.
//
//   If the RPC is unavailable (PGRST202/42883 — migration not yet applied),
//   the loader falls through to the FALLBACK path immediately.
//
// FALLBACK — direct table queries (paginated)
//   Preserves the original published-history behaviour so release notes remain
//   usable before the snapshot RPC exists.  publishedVersions is empty in this
//   path so markReleasesRead is never called — unread tracking stays hidden.
//
// Mark-as-read
//   After a successful PRIMARY load, markReleasesRead receives the exact
//   { id, published_at } rows returned by that snapshot.

import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { markReleasesRead } from "@/lib/release-notes/server-helpers";
import type { PublishedRelease } from "@/lib/release-notes/server-helpers";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface LoadedItem {
  id: string;
  release_note_id: string;
  order_index: number;
  title: string;
  location: string;
  details: string;
  created_at: string;
}

interface LoadedRelease {
  id: string;
  title: string;
  release_date: string;
  published_at: string;
  created_at: string;
  items: LoadedItem[];
}

interface LoadResult {
  releases: LoadedRelease[];
  /** Exact { id, published_at } snapshots from the primary loader.
   *  Empty array in the fallback path — mark-read is skipped. */
  publishedVersions: PublishedRelease[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// PRIMARY loader — snapshot RPC
// Returns null when the RPC does not exist (caller falls back).
// Returns LoadResult on success or a DB error.
// ---------------------------------------------------------------------------
async function loadViaSnapshot(supabase: any): Promise<LoadResult | null> {
  const { data, error } = await supabase.rpc(
    "get_published_release_notes_snapshot"
  );

  if (error) {
    // Missing function → signal caller to use the fallback path.
    const isMissing =
      error.code === "PGRST202" ||
      error.code === "42883" ||
      error.message?.includes("does not exist") ||
      error.message?.includes("get_published_release_notes_snapshot");
    if (isMissing) return null;

    // Any other error — surface it to the user.
    return {
      releases: [],
      publishedVersions: [],
      error: "We could not load release notes. Please try again shortly.",
    };
  }

  if (!data || (data as any[]).length === 0) {
    return { releases: [], publishedVersions: [], error: null };
  }

  // The RPC already returns releases and nested items in display order.
  const releases: LoadedRelease[] = (data as any[]).map((row) => ({
    id: row.id,
    title: row.title,
    release_date: row.release_date,
    published_at: row.published_at,
    created_at: row.created_at,
    items: (Array.isArray(row.items) ? row.items : []).map((item: any) => ({
      id: item.id,
      release_note_id: row.id,
      order_index: item.order_index ?? 0,
      title: item.title ?? "",
      location: item.location ?? "",
      details: item.details ?? "",
      created_at: item.created_at ?? "",
    })),
  }));

  // Capture the exact published_at version for every release in this snapshot.
  const publishedVersions: PublishedRelease[] = releases.map((r) => ({
    id: r.id,
    published_at: r.published_at,
  }));

  return { releases, publishedVersions, error: null };
}

// ---------------------------------------------------------------------------
// FALLBACK loader — direct paginated table queries
// Used when the snapshot RPC is not yet available.
// publishedVersions is always empty; mark-read is never attempted.
// ---------------------------------------------------------------------------
async function loadViaDirectQueries(supabase: any): Promise<LoadResult> {
  const rawReleases: any[] = [];
  const pageSize = 200;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error: relErr } = await supabase
      .from("release_notes")
      .select("id, title, release_date, published_at, created_at")
      .eq("status", "published")
      .order("release_date", { ascending: false })
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (relErr) {
      return {
        releases: [],
        publishedVersions: [],
        error: "We could not load release notes. Please try again shortly.",
      };
    }
    rawReleases.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  if (rawReleases.length === 0) {
    return { releases: [], publishedVersions: [], error: null };
  }

  const releaseIds: string[] = rawReleases.map((r) => r.id);
  const items: any[] = [];

  for (let start = 0; start < releaseIds.length; start += 100) {
    const chunk = releaseIds.slice(start, start + 100);
    const itemPageSize = 500;

    for (let offset = 0; ; offset += itemPageSize) {
      const { data, error: itemErr } = await supabase
        .from("release_note_items")
        .select("id, release_note_id, order_index, title, location, details, created_at")
        .in("release_note_id", chunk)
        .order("release_note_id", { ascending: true })
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + itemPageSize - 1);

      if (itemErr) {
        return {
          releases: [],
          publishedVersions: [],
          error: "We could not load the release note details. Please try again shortly.",
        };
      }
      items.push(...(data ?? []));
      if (!data || data.length < itemPageSize) break;
    }
  }

  const itemsByRelease = new Map<string, LoadedItem[]>();
  for (const item of items) {
    const bucket = itemsByRelease.get(item.release_note_id) ?? [];
    bucket.push(item as LoadedItem);
    itemsByRelease.set(item.release_note_id, bucket);
  }

  const releases: LoadedRelease[] = rawReleases.map((r) => ({
    id: r.id,
    title: r.title,
    release_date: r.release_date,
    published_at: r.published_at,
    created_at: r.created_at,
    items: itemsByRelease.get(r.id) ?? [],
  }));

  // publishedVersions intentionally empty: snapshot RPC is not available so
  // mark-release-notes-read RPC will also be absent; skip the write entirely.
  return { releases, publishedVersions: [], error: null };
}

// ---------------------------------------------------------------------------
// Top-level loader — auth guard + strategy selection
// ---------------------------------------------------------------------------
async function loadPublishedReleaseNotes(): Promise<LoadResult> {
  noStore();
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/auth/login");

  // Try the atomic snapshot RPC first.
  const primary = await loadViaSnapshot(supabase);

  if (primary !== null) {
    // RPC existed (success or a non-missing error). Mark only the exact
    // publication versions returned by that statement.
    if (!primary.error && primary.publishedVersions.length > 0) {
      await markReleasesRead(supabase, primary.publishedVersions);
    }
    return primary;
  }

  // RPC not available — use the direct-query fallback.
  return loadViaDirectQueries(supabase);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateStr}T00:00:00`));
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function ReleaseNotesPage() {
  const { releases, error } = await loadPublishedReleaseNotes();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="border-b pb-5">
        <p className="text-sm font-medium text-blue-700">Product updates</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Release Notes
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          A history of improvements and changes to the training platform.
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800"
        >
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
                <time
                  className="text-sm font-medium text-blue-700"
                  dateTime={release.release_date}
                >
                  {formatDate(release.release_date)}
                </time>
                <h2 className="mt-1 text-xl font-bold text-gray-950">
                  {release.title}
                </h2>

                <ol className="mt-5 space-y-4">
                  {release.items.map((item, index) => (
                    <li key={item.id} className="rounded-lg bg-gray-50 p-4">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {index + 1}. Where
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {item.location}
                        </span>
                      </div>
                      <h3 className="mt-2 font-semibold text-gray-950">
                        {item.title}
                      </h3>
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
