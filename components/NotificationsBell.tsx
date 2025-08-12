"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Notif = {
  id: string;
  type: string;
  payload: Record<string, any> | null;
  read: boolean;
  created_at: string;
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const unreadCount = useMemo(
    () => items.filter((n) => !n.read).length,
    [items]
  );
  const userIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  async function fetchLatest(limit = 20) {
    const uid = userIdRef.current;
    if (!uid) return;
    const { data, error } = await supabaseBrowser
      .from("notifications")
      .select("id, type, payload, read, created_at")
      .eq("recipient_id", uid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      setErr(error.message);
      return;
    }
    setItems((data as Notif[]) ?? []);
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: auth } = await supabaseBrowser.auth.getUser();
      const uid = auth.user?.id ?? null;
      userIdRef.current = uid;

      if (!uid) {
        setErr("No authenticated user");
        return;
      }

      setErr(null);
      await fetchLatest();

      // Try Realtime
      try {
        const channel = supabaseBrowser
          .channel("notif-stream")
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              filter: `recipient_id=eq.${uid}`,
            },
            (payload: any) => {
              const n = payload.new as Notif;
              setItems((prev) => [n, ...prev].slice(0, 20));
            }
          )
          .subscribe((status) => {
            // If we can't subscribe (or Realtime isn't enabled), we rely on polling below.
          });

        unsubRef.current = () => channel.unsubscribe();
      } catch {
        // Ignore — we’ll rely on polling
      }

      // Polling fallback (also good as a gentle refresh)
      if (mounted) {
        pollTimerRef.current = setInterval(() => {
          fetchLatest();
        }, 10_000); // 10s
      }
    })();

    return () => {
      mounted = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  async function markAllRead() {
    const uid = userIdRef.current;
    if (!uid) return;
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    const { error } = await supabaseBrowser
      .from("notifications")
      .update({ read: true })
      .in("id", ids);
    if (!error) setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  }

  async function refreshNow() {
    await fetchLatest();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md border px-3 py-1 text-sm"
        title="Notifications"
      >
        Notifications
        {unreadCount > 0 && (
          <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-md border bg-white shadow">
          <div className="flex items-center justify-between p-2">
            <div className="text-sm font-medium">Notifications</div>
            <div className="flex items-center gap-2">
              <button onClick={refreshNow} className="text-xs underline">
                Refresh
              </button>
              <button
                onClick={markAllRead}
                className="text-xs underline"
                disabled={unreadCount === 0}
              >
                Mark all read
              </button>
            </div>
          </div>

          {err && (
            <div className="m-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {err}
            </div>
          )}

          <div className="max-h-80 divide-y overflow-auto">
            {items.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No notifications.</div>
            ) : (
              items.map((n) => (
                <div key={n.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {labelForType(n.type, n.payload || {})}
                    </div>
                    {!n.read && (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] uppercase text-blue-700">
                        new
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    {detailForType(n.type, n.payload || {})}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function labelForType(type: string, payload: any) {
  switch (type) {
    case "enrolment_approved":
      return "Enrolment approved";
    case "enrolment_request":
      return "New enrolment request";
    case "course_completed":
      return "Course completed";
    case "authorisation_ready":
      return "Authorisation ready";
    case "role_granted":
      return "Role granted";
    case "role_revoked":
      return "Role revoked";
    case "profile_updated":
      return "Profile updated";
    default:
      return type;
  }
}

function detailForType(type: string, payload: any) {
  switch (type) {
    case "enrolment_approved":
      return `You can start: ${payload?.course_title ?? "Course"}`;
    case "enrolment_request":
      return `Course: ${payload?.course_title ?? "-"}`;
    case "course_completed":
      return `Course: ${payload?.course_title ?? "-"}`;
    case "authorisation_ready":
      return `${payload?.user_name ?? "User"} — ${payload?.authorisation_title ?? "Authorisation"}`;
    case "role_granted":
      return `Granted: ${payload?.role_name ?? "-"}`;
    case "role_revoked":
      return `Revoked: ${payload?.role_name ?? "-"}`;
    case "profile_updated":
      return `Your profile information was updated.`;
    default:
      return "";
  }
}
