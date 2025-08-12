"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Notif = {
  id: string;
  type: string;
  payload: Record<string, any>;
  read: boolean;
  created_at: string;
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const unreadCount = useMemo(
    () => items.filter((n) => !n.read).length,
    [items]
  );

  useEffect(() => {
    let userId: string | null = null;
    let unsub: (() => void) | null = null;

    (async () => {
      // who am I?
      const { data: userData } = await supabaseBrowser.auth.getUser();
      userId = userData.user?.id ?? null;
      if (!userId) return;

      // initial unread + recent
      const { data } = await supabaseBrowser
        .from("notifications")
        .select("id, type, payload, read, created_at")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      setItems(data ?? []);

      // realtime: listen for new notifications for me
      const channel = supabaseBrowser
        .channel("notif-stream")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${userId}`,
          },
          (payload: any) => {
            const n = payload.new as Notif;
            setItems((prev) => [n, ...prev].slice(0, 20));
          }
        )
        .subscribe();

      unsub = () => {
        channel.unsubscribe();
      };
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  async function markAllRead() {
    const { data: userData } = await supabaseBrowser.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (ids.length === 0) return;
    // RLS allows recipient to update their own notifications
    await supabaseBrowser
      .from("notifications")
      .update({ read: true })
      .in("id", ids);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
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
            <button
              onClick={markAllRead}
              className="text-xs underline"
              disabled={unreadCount === 0}
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-80 divide-y overflow-auto">
            {items.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No notifications.</div>
            ) : (
              items.map((n) => (
                <div key={n.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {labelForType(n.type, n.payload)}
                    </div>
                    {!n.read && (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] uppercase text-blue-700">
                        new
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    {detailForType(n.type, n.payload)}
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
    default:
      return "";
  }
}
