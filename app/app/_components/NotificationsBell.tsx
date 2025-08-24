"use client";

import { useEffect, useState } from "react";

type Noti = {
  id: string;
  type: string;
  payload: Record<string, any> | null;
  read: boolean;
  created_at: string;
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Noti[]>([]);
  const unread = items.filter((n) => !n.read).length;

  async function load() {
    try {
      const res = await fetch("/app/notifications/list", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data?.notifications ?? []);
    } catch {}
  }

  async function markAllRead() {
    try {
      await fetch("/app/notifications/mark-read", { method: "POST" });
      await load();
    } catch {}
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30000); // poll every 30s
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md border px-3 py-1 text-sm"
        title="Notifications"
      >
        Notifications
        {unread > 0 && (
          <span className="ml-2 inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] rounded-md border bg-white p-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">Notifications</div>
            <button onClick={markAllRead} className="text-xs underline">
              Mark all read
            </button>
          </div>

          {items.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">No notifications.</div>
          ) : (
            <ul className="max-h-80 divide-y overflow-auto">
              {items.map((n) => (
                <li key={n.id} className="p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">
                        {labelFor(n.type, n.payload)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                    {!n.read && (
                      <span className="mt-1 inline-block h-2 w-2 rounded-full bg-red-600" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function labelFor(type: string, p: any) {
  switch (type) {
    case "enrolment_request":
      return `New enrolment request: ${p?.course_title ?? ""}`;
    case "enrolment_approved":
      return `Enrolment approved: ${p?.course_title ?? ""}`;
    case "role_granted":
      return `Role granted: ${p?.role_name ?? ""}`;
    case "role_revoked":
      return `Role revoked: ${p?.role_name ?? ""}`;
    case "course_published":
      return `Course published: ${p?.title ?? ""}`;
    default:
      return "Notification";
  }
}
