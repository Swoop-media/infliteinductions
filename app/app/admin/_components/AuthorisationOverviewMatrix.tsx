// @ts-nocheck
"use client";

import { useMemo, useState } from "react";

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  site_name: string | null;
};

type AuthRow = {
  id: string;
  title: string;
  department: string | null;
};

type Completion = {
  approved_at: string;
  expires_at: string | null;
};

type Props = {
  users: UserRow[];
  authorisations: AuthRow[];
  // Map<userId, Record<authId, Completion>>
  completions: Record<string, Record<string, Completion>>;
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function cellStyle(c: Completion | undefined): {
  bg: string;
  text: string;
  label: string;
  title: string;
} {
  if (!c) {
    return { bg: "#000000", text: "#ffffff", label: "—", title: "Never completed" };
  }
  // No expiry -> treat as in date
  if (!c.expires_at) {
    return {
      bg: "#16a34a",
      text: "#ffffff",
      label: formatDate(c.approved_at) || "Completed",
      title: `Completed ${formatDate(c.approved_at)} • No expiry`,
    };
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const exp = new Date(c.expires_at);
  exp.setUTCHours(0, 0, 0, 0);
  const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
  const label = formatDate(c.expires_at);
  if (days < 0) {
    return {
      bg: "#dc2626",
      text: "#ffffff",
      label,
      title: `Overdue by ${Math.abs(days)} days (expired ${label})`,
    };
  }
  if (days <= 30) {
    return {
      bg: "#f97316",
      text: "#ffffff",
      label,
      title: `Due in ${days} days (${label})`,
    };
  }
  return {
    bg: "#16a34a",
    text: "#ffffff",
    label,
    title: `In date — expires ${label} (${days} days)`,
  };
}

export default function AuthorisationOverviewMatrix({
  users,
  authorisations,
  completions,
}: Props) {
  const [userQuery, setUserQuery] = useState("");
  const [authQuery, setAuthQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedAuths, setSelectedAuths] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState(false);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.full_name?.toLowerCase().includes(q) ?? false) ||
        (u.email?.toLowerCase().includes(q) ?? false) ||
        (u.site_name?.toLowerCase().includes(q) ?? false)
    );
  }, [users, userQuery]);

  const filteredAuths = useMemo(() => {
    const q = authQuery.trim().toLowerCase();
    if (!q) return authorisations;
    return authorisations.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.department?.toLowerCase().includes(q) ?? false)
    );
  }, [authorisations, authQuery]);

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function selectAll(ids: string[], setter: (s: Set<string>) => void) {
    setter(new Set(ids));
  }

  function clearAll(setter: (s: Set<string>) => void) {
    setter(new Set());
  }

  const tableUsers = useMemo(
    () =>
      users
        .filter((u) => selectedUsers.has(u.id))
        .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")),
    [users, selectedUsers]
  );
  const tableAuths = useMemo(
    () =>
      authorisations
        .filter((a) => selectedAuths.has(a.id))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [authorisations, selectedAuths]
  );

  function exportCsv() {
    const header = ["Staff", "Email", "Site", ...tableAuths.map((a) => a.title)];
    const rows = tableUsers.map((u) => {
      const userComps = completions[u.id] || {};
      return [
        u.full_name || "",
        u.email || "",
        u.site_name || "",
        ...tableAuths.map((a) => {
          const c = userComps[a.id];
          if (!c) return "Never completed";
          const style = cellStyle(c);
          return `${style.label} (${style.title})`;
        }),
      ];
    });
    const csv = [header, ...rows]
      .map((r) =>
        r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `authorisation-overview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Staff selector */}
        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm">Staff ({selectedUsers.size} selected)</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => selectAll(filteredUsers.map((u) => u.id), setSelectedUsers)}
                className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
              >
                Select all{userQuery ? " (filtered)" : ""}
              </button>
              <button
                type="button"
                onClick={() => clearAll(setSelectedUsers)}
                className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          </div>
          <input
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="Search staff, email, site..."
            className="w-full rounded border px-2 py-1 text-sm mb-2"
          />
          <div className="max-h-64 overflow-auto border rounded">
            {filteredUsers.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedUsers.has(u.id)}
                  onChange={() => toggle(selectedUsers, u.id, setSelectedUsers)}
                />
                <span className="flex-1 truncate">{u.full_name || u.email}</span>
                {u.site_name && (
                  <span className="text-xs text-gray-500">{u.site_name}</span>
                )}
              </label>
            ))}
            {filteredUsers.length === 0 && (
              <div className="p-3 text-sm text-gray-500">No staff match.</div>
            )}
          </div>
        </div>

        {/* Authorisation selector */}
        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-sm">
              Authorisations ({selectedAuths.size} selected)
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => selectAll(filteredAuths.map((a) => a.id), setSelectedAuths)}
                className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
              >
                Select all{authQuery ? " (filtered)" : ""}
              </button>
              <button
                type="button"
                onClick={() => clearAll(setSelectedAuths)}
                className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          </div>
          <input
            value={authQuery}
            onChange={(e) => setAuthQuery(e.target.value)}
            placeholder="Search authorisation or department..."
            className="w-full rounded border px-2 py-1 text-sm mb-2"
          />
          <div className="max-h-64 overflow-auto border rounded">
            {filteredAuths.map((a) => (
              <label
                key={a.id}
                className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedAuths.has(a.id)}
                  onChange={() => toggle(selectedAuths, a.id, setSelectedAuths)}
                />
                <span className="flex-1 truncate">{a.title}</span>
                {a.department && (
                  <span className="text-xs text-gray-500">{a.department}</span>
                )}
              </label>
            ))}
            {filteredAuths.length === 0 && (
              <div className="p-3 text-sm text-gray-500">No authorisations match.</div>
            )}
          </div>
        </div>
      </div>

      {/* Actions + Legend */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setGenerated(true)}
          disabled={selectedUsers.size === 0 || selectedAuths.size === 0}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Generate Table
        </button>
        {generated && tableUsers.length > 0 && tableAuths.length > 0 && (
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Export CSV
          </button>
        )}
        <div className="flex items-center gap-3 ml-auto text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded" style={{ background: "#16a34a" }} />
            In date
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded" style={{ background: "#f97316" }} />
            Due ≤ 30 days
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded" style={{ background: "#dc2626" }} />
            Overdue
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded" style={{ background: "#000000" }} />
            Never completed
          </span>
        </div>
      </div>

      {/* Matrix */}
      {generated && (
        <>
          {tableUsers.length === 0 || tableAuths.length === 0 ? (
            <p className="text-sm text-gray-600">
              Select at least one staff member and one authorisation, then click Generate Table.
            </p>
          ) : (
            <div className="overflow-auto border rounded-md">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th
                      className="sticky left-0 top-0 z-30 bg-gray-100 border px-2 py-2 text-left font-semibold whitespace-nowrap"
                      style={{ minWidth: 200 }}
                    >
                      Staff Member
                    </th>
                    {tableAuths.map((a) => (
                      <th
                        key={a.id}
                        className="sticky top-0 z-20 bg-gray-100 border px-2 py-2 text-center font-semibold align-bottom"
                        style={{ minWidth: 110, maxWidth: 140 }}
                        title={a.department ? `${a.title} (${a.department})` : a.title}
                      >
                        <div className="whitespace-normal break-words leading-tight">
                          {a.title}
                        </div>
                        {a.department && (
                          <div className="text-[10px] font-normal text-gray-500 mt-0.5">
                            {a.department}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableUsers.map((u) => {
                    const userComps = completions[u.id] || {};
                    return (
                      <tr key={u.id}>
                        <th
                          className="sticky left-0 z-10 bg-white border px-2 py-1 text-left font-medium whitespace-nowrap"
                          style={{ minWidth: 200 }}
                        >
                          <div>{u.full_name || u.email}</div>
                          {u.site_name && (
                            <div className="text-[10px] font-normal text-gray-500">
                              {u.site_name}
                            </div>
                          )}
                        </th>
                        {tableAuths.map((a) => {
                          const c = userComps[a.id];
                          const s = cellStyle(c);
                          return (
                            <td
                              key={a.id}
                              className="border px-1 py-1 text-center font-medium"
                              style={{
                                background: s.bg,
                                color: s.text,
                                minWidth: 110,
                                maxWidth: 140,
                              }}
                              title={s.title}
                            >
                              {s.label}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
