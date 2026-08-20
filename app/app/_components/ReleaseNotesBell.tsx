// @ts-nocheck
// app/app/_components/ReleaseNotesBell.tsx
// Header button for Release Notes with an unread count badge.
//
// Design:
// - Receives an initial server-side count so the badge is visible on first paint.
// - Polls every 30 s to keep the count fresh (restores any concurrent new notes).
// - Optimistically clears the local badge when pathname becomes /app/release-notes
//   — no unversioned POST is issued here. The server page is the source of truth:
//   it calls the atomic mark RPC with the exact id+published_at rows it rendered,
//   and the next poll will reflect the updated server state.
"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

interface Props {
  initialCount: number;
}

const BADGE_CAP = 99;
const POLL_MS = 30_000;
const NOTES_PATH = "/app/release-notes";

export default function ReleaseNotesBell({ initialCount }: Props) {
  const [count, setCount] = useState(initialCount);
  const pathname = usePathname();
  const router = useRouter();

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/app/release-notes/unread", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setCount(typeof data?.count === "number" ? data.count : 0);
    } catch {
      // silent — badge stays as-is until next poll
    }
  }, []);

  // Poll for refreshed count every 30 s
  useEffect(() => {
    const id = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(id);
  }, [fetchCount]);

  // Optimistically clear the badge when the user lands on the release notes page.
  // The server page handles the authoritative mark-as-read write.
  // If the write fails or new notes arrive, the next poll restores the true count.
  useEffect(() => {
    if (pathname === NOTES_PATH) {
      setCount(0);
    }
  }, [pathname]);

  function handleClick() {
    setCount(0);
    if (pathname === NOTES_PATH) {
      router.refresh();
    } else {
      router.push(NOTES_PATH);
    }
  }

  const displayCount = count > BADGE_CAP ? `${BADGE_CAP}+` : count;
  const ariaLabel =
    count === 0
      ? "Release Notes, no unread"
      : `Release Notes, ${count > BADGE_CAP ? "more than 99" : count} unread`;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      className="relative whitespace-nowrap rounded-md border border-gray-700 bg-black px-2.5 py-1 text-xs text-white hover:bg-gray-800"
    >
      Release Notes
      {count > 0 && (
        <span
          aria-hidden="true"
          className="ml-2 inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white"
        >
          {displayCount}
        </span>
      )}
    </button>
  );
}
