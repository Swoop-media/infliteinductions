// lib/release-notes/server-helpers.ts
// Shared server-side helpers for release-note read-tracking.
//
// Atomic RPCs (migration 034, file: 034_release_note_reads.sql):
//
//   get_unread_release_note_count() → bigint
//     Returns the number of published notes the caller has not yet read, or
//     whose read_published_at no longer matches the note's current published_at
//     (i.e. re-published since the user last viewed it).
//
//   mark_release_notes_read(expected_releases jsonb) → integer
//     Upserts read receipts for the caller. Only notes whose supplied
//     published_at still matches the DB's current published_at are accepted;
//     stale or fabricated entries are silently skipped by the RPC.
//     expected_releases: [{"id": "<uuid>", "published_at": "<iso8601>"}, …]
//
// When those functions are unavailable (migration not yet applied, or any
// RPC error) the helpers degrade gracefully:
//   • countUnreadReleases returns { count: 0, tableExists: false } so the
//     badge hides rather than breaks the app.
//   • markReleasesRead swallows all errors silently so the page is never
//     blocked by a write failure.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PublishedRelease {
  id: string;
  published_at: string;
}

// ---------------------------------------------------------------------------
// Count unread published releases for the authenticated user.
// Delegates entirely to the atomic RPC — no client-side join or pagination.
// Returns { count: 0, tableExists: false } when the function is missing so
// the badge hides gracefully.
// ---------------------------------------------------------------------------
export async function countUnreadReleases(
  supabase: SupabaseClient,
  // The RPC resolves the caller via auth.uid() internally. The _userId
  // parameter is accepted but unused so layout.tsx callers need no change.
  _userId?: string
): Promise<{ count: number; tableExists: boolean }> {
  try {
    const { data, error } = await supabase.rpc("get_unread_release_note_count");

    if (error) {
      // PGRST202 = function not registered in PostgREST schema cache.
      // 42883   = function does not exist in Postgres.
      // Belt-and-suspenders string check covers renamed/renamed environments.
      const isMissing =
        error.code === "PGRST202" ||
        error.code === "42883" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("get_unread_release_note_count");
      if (isMissing) {
        return { count: 0, tableExists: false };
      }
      // Other transient errors (auth, network) — hide badge, don't surface.
      return { count: 0, tableExists: true };
    }

    // RPC returns bigint; JS receives it as a number or string.
    const parsed = Number(data);
    const count = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    return { count, tableExists: true };
  } catch {
    return { count: 0, tableExists: false };
  }
}

// ---------------------------------------------------------------------------
// Mark an exact set of published releases as read for the authenticated user.
//
// Accepts the precise { id, published_at } rows that were rendered so the RPC
// can validate that each supplied published_at still matches the current DB
// value before writing the receipt. A note re-published after this call will
// have a new published_at and will immediately count as unread again.
//
// Payload is chunked (≤ 50 rows per call, ~5 KB per JSONB argument) so very
// large release histories don't exceed PostgREST / Postgres limits.
//
// All errors — missing function, RLS rejection, network — are swallowed.
// The caller must never block display on a write failure.
// ---------------------------------------------------------------------------
export async function markReleasesRead(
  supabase: SupabaseClient,
  releases: PublishedRelease[]
): Promise<void> {
  if (releases.length === 0) return;

  const CHUNK = 50;

  for (let start = 0; start < releases.length; start += CHUNK) {
    const chunk = releases.slice(start, start + CHUNK);

    try {
      await supabase.rpc("mark_release_notes_read", {
        expected_releases: chunk,
      });
    } catch {
      // Intentionally silent — display must never block on write failures.
    }
    // RPC-level errors (missing function, RLS, network) are also silently
    // discarded; the page renders regardless.
  }
}
