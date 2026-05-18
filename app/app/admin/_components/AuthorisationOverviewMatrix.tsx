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

type StatusKey = "in_date" | "due_soon" | "overdue" | "never";

const STATUS_META: Record<
  StatusKey,
  { label: string; bg: string; text: string }
> = {
  in_date: { label: "In date", bg: "#16a34a", text: "#ffffff" },
  due_soon: { label: "Due ≤ 30 days", bg: "#f97316", text: "#ffffff" },
  overdue: { label: "Overdue", bg: "#dc2626", text: "#ffffff" },
  never: { label: "Never completed", bg: "#000000", text: "#ffffff" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function classify(c: Completion | undefined): StatusKey {
  if (!c) return "never";
  if (!c.expires_at) return "in_date";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const exp = new Date(c.expires_at);
  exp.setUTCHours(0, 0, 0, 0);
  const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
  if (days < 0) return "overdue";
  if (days <= 30) return "due_soon";
  return "in_date";
}

function cellInfo(c: Completion | undefined): {
  status: StatusKey;
  bg: string;
  text: string;
  label: string;
  title: string;
} {
  const status = classify(c);
  const meta = STATUS_META[status];
  if (status === "never") {
    return { status, bg: meta.bg, text: meta.text, label: "—", title: "Never completed" };
  }
  if (!c!.expires_at) {
    return {
      status,
      bg: meta.bg,
      text: meta.text,
      label: formatDate(c!.approved_at) || "Completed",
      title: `Completed ${formatDate(c!.approved_at)} • No expiry`,
    };
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const exp = new Date(c!.expires_at!);
  exp.setUTCHours(0, 0, 0, 0);
  const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
  const label = formatDate(c!.expires_at);
  if (status === "overdue") {
    return {
      status,
      bg: meta.bg,
      text: meta.text,
      label,
      title: `Overdue by ${Math.abs(days)} days (expired ${label})`,
    };
  }
  if (status === "due_soon") {
    return { status, bg: meta.bg, text: meta.text, label, title: `Due in ${days} days (${label})` };
  }
  return { status, bg: meta.bg, text: meta.text, label, title: `In date — expires ${label} (${days} days)` };
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
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState(false);
  const [view, setView] = useState<"matrix" | "charts">("matrix");
  const [visibleStatuses, setVisibleStatuses] = useState<Set<StatusKey>>(
    new Set<StatusKey>(["overdue", "due_soon", "in_date", "never"])
  );

  // Derive available sites and departments from the loaded data
  const NO_SITE = "__no_site__";
  const NO_DEPT = "__no_dept__";

  const siteOptions = useMemo(() => {
    const set = new Set<string>();
    let hasNone = false;
    users.forEach((u) => {
      if (u.site_name) set.add(u.site_name);
      else hasNone = true;
    });
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (hasNone) arr.push(NO_SITE);
    return arr;
  }, [users]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    let hasNone = false;
    authorisations.forEach((a) => {
      if (a.department) set.add(a.department);
      else hasNone = true;
    });
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (hasNone) arr.push(NO_DEPT);
    return arr;
  }, [authorisations]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users.filter((u) => {
      // Site filter
      if (selectedSites.size > 0) {
        const key = u.site_name || NO_SITE;
        if (!selectedSites.has(key)) return false;
      }
      // Search filter
      if (!q) return true;
      return (
        (u.full_name?.toLowerCase().includes(q) ?? false) ||
        (u.email?.toLowerCase().includes(q) ?? false) ||
        (u.site_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, userQuery, selectedSites]);

  const filteredAuths = useMemo(() => {
    const q = authQuery.trim().toLowerCase();
    return authorisations.filter((a) => {
      // Department filter
      if (selectedDepartments.size > 0) {
        const key = a.department || NO_DEPT;
        if (!selectedDepartments.has(key)) return false;
      }
      // Search filter
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        (a.department?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [authorisations, authQuery, selectedDepartments]);

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

  function toggleStatus(s: StatusKey) {
    const next = new Set(visibleStatuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setVisibleStatuses(next);
  }

  const baseUsers = useMemo(
    () =>
      users
        .filter((u) => selectedUsers.has(u.id))
        .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")),
    [users, selectedUsers]
  );
  const baseAuths = useMemo(
    () =>
      authorisations
        .filter((a) => selectedAuths.has(a.id))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [authorisations, selectedAuths]
  );

  // Status-aware filtering: drop users/auths that have no cells matching the
  // currently visible statuses so the table only shows what the user asked for.
  const { tableUsers, tableAuths, hiddenUsersCount, hiddenAuthsCount } = useMemo(() => {
    const userHas: Record<string, boolean> = {};
    const authHas: Record<string, boolean> = {};
    baseUsers.forEach((u) => {
      const comps = completions[u.id] || {};
      baseAuths.forEach((a) => {
        const info = cellInfo(comps[a.id]);
        if (visibleStatuses.has(info.status)) {
          userHas[u.id] = true;
          authHas[a.id] = true;
        }
      });
    });
    const tu = baseUsers.filter((u) => userHas[u.id]);
    const ta = baseAuths.filter((a) => authHas[a.id]);
    return {
      tableUsers: tu,
      tableAuths: ta,
      hiddenUsersCount: baseUsers.length - tu.length,
      hiddenAuthsCount: baseAuths.length - ta.length,
    };
  }, [baseUsers, baseAuths, completions, visibleStatuses]);

  // ---- Aggregations for charts ----
  const stats = useMemo(() => {
    const totals: Record<StatusKey, number> = {
      in_date: 0,
      due_soon: 0,
      overdue: 0,
      never: 0,
    };
    const perUser = new Map<string, Record<StatusKey, number>>();
    const perAuth = new Map<string, Record<StatusKey, number>>();
    // Compact tuples to keep memory low: [userId, authId, status, detail]
    const matches: Array<[string, string, StatusKey, string]> = [];

    tableUsers.forEach((u) => {
      const userComps = completions[u.id] || {};
      perUser.set(u.id, { in_date: 0, due_soon: 0, overdue: 0, never: 0 });
      tableAuths.forEach((a) => {
        if (!perAuth.has(a.id))
          perAuth.set(a.id, { in_date: 0, due_soon: 0, overdue: 0, never: 0 });
        const info = cellInfo(userComps[a.id]);
        totals[info.status]++;
        perUser.get(u.id)![info.status]++;
        perAuth.get(a.id)![info.status]++;
        if (visibleStatuses.has(info.status)) {
          matches.push([u.id, a.id, info.status, info.title]);
        }
      });
    });

    return { totals, perUser, perAuth, matches };
  }, [tableUsers, tableAuths, completions, visibleStatuses]);

  // Lookup maps for rendering match rows by id
  const userById = useMemo(
    () => new Map(tableUsers.map((u) => [u.id, u])),
    [tableUsers]
  );
  const authById = useMemo(
    () => new Map(tableAuths.map((a) => [a.id, a])),
    [tableAuths]
  );

  const sortedMatches = useMemo(() => {
    const order: Record<StatusKey, number> = {
      overdue: 0,
      due_soon: 1,
      never: 2,
      in_date: 3,
    };
    return [...stats.matches].sort((a, b) => order[a[2]] - order[b[2]]);
  }, [stats.matches]);

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
          const info = cellInfo(c);
          return `${info.label} (${info.title})`;
        }),
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `authorisation-overview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 24;
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

    const labelColW = 130;
    const headerRowH = 70;
    const rowH = 18;
    const titleBlockH = 36;

    // Adaptive column width: prefer 60pt, shrink to 44pt, otherwise split into column chunks.
    const usableW = pageW - margin * 2 - labelColW;
    const preferredColW = 60;
    const minColW = 44;
    const maxColsPerPage = Math.max(1, Math.floor(usableW / minColW));
    const colsPerPage = Math.min(tableAuths.length, maxColsPerPage);
    const colW = Math.min(preferredColW, Math.max(minColW, usableW / Math.max(1, colsPerPage)));

    // Chunk authorisations into horizontal pages
    const chunks: AuthRow[][] = [];
    for (let i = 0; i < tableAuths.length; i += colsPerPage) {
      chunks.push(tableAuths.slice(i, i + colsPerPage));
    }

    const drawPageHeader = (chunkIdx: number, totalChunks: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(20, 20, 20);
      doc.text("Authorisation Overview", margin, margin + 6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const suffix = totalChunks > 1 ? ` • Page set ${chunkIdx + 1}/${totalChunks}` : "";
      doc.text(
        `Generated ${dateStr} • ${tableUsers.length} staff × ${tableAuths.length} authorisations${suffix}`,
        margin,
        margin + 22
      );

      // Legend
      let lx = pageW - margin;
      doc.setFontSize(8);
      (["never", "overdue", "due_soon", "in_date"] as StatusKey[]).forEach((s) => {
        const meta = STATUS_META[s];
        const w = doc.getTextWidth(meta.label) + 22;
        lx -= w;
        const [r, g, b] = hexToRgb(meta.bg);
        doc.setFillColor(r, g, b);
        doc.rect(lx, margin - 2, 10, 10, "F");
        doc.setTextColor(20, 20, 20);
        doc.text(meta.label, lx + 14, margin + 6);
      });
    };

    const drawTableHeader = (y: number, auths: AuthRow[]) => {
      doc.setFillColor(243, 244, 246);
      doc.rect(margin, y, labelColW, headerRowH, "F");
      doc.setDrawColor(200, 200, 200);
      doc.rect(margin, y, labelColW, headerRowH);
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Staff Member", margin + 4, y + 14);

      auths.forEach((a, i) => {
        const x = margin + labelColW + i * colW;
        doc.setFillColor(243, 244, 246);
        doc.rect(x, y, colW, headerRowH, "F");
        doc.rect(x, y, colW, headerRowH);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        const lines = doc.splitTextToSize(a.title, colW - 6).slice(0, 5);
        lines.forEach((line: string, li: number) => {
          doc.text(line, x + colW / 2, y + 10 + li * 8, { align: "center" });
        });
        if (a.department) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.setTextColor(110, 110, 110);
          doc.text(
            doc.splitTextToSize(a.department, colW - 6).slice(0, 1)[0] || "",
            x + colW / 2,
            y + headerRowH - 5,
            { align: "center" }
          );
          doc.setFont("helvetica", "bold");
          doc.setTextColor(20, 20, 20);
        }
      });
    };

    chunks.forEach((chunkAuths, chunkIdx) => {
      if (chunkIdx > 0) doc.addPage();
      drawPageHeader(chunkIdx, chunks.length);
      let y = margin + titleBlockH;
      drawTableHeader(y, chunkAuths);
      y += headerRowH;

      tableUsers.forEach((u) => {
        if (y + rowH > pageH - margin) {
          doc.addPage();
          drawPageHeader(chunkIdx, chunks.length);
          y = margin + titleBlockH;
          drawTableHeader(y, chunkAuths);
          y += headerRowH;
        }
        // staff cell
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, y, labelColW, rowH, "F");
        doc.setDrawColor(220, 220, 220);
        doc.rect(margin, y, labelColW, rowH);
        doc.setTextColor(20, 20, 20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        const nameLines = doc.splitTextToSize(u.full_name || u.email || "", labelColW - 6);
        doc.text(nameLines[0] || "", margin + 4, y + 11);
        if (u.site_name) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.setTextColor(120, 120, 120);
          doc.text(u.site_name, margin + 4, y + rowH - 3);
        }

        const userComps = completions[u.id] || {};
        chunkAuths.forEach((a, i) => {
          const x = margin + labelColW + i * colW;
          const info = cellInfo(userComps[a.id]);
          const [r, g, b] = hexToRgb(info.bg);
          doc.setFillColor(r, g, b);
          doc.rect(x, y, colW, rowH, "F");
          doc.setDrawColor(220, 220, 220);
          doc.rect(x, y, colW, rowH);
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.text(info.label, x + colW / 2, y + 12, { align: "center" });
        });

        y += rowH;
      });
    });

    doc.save(`authorisation-overview-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // ---- Render helpers ----
  function HBarChart({
    title,
    rows,
  }: {
    title: string;
    rows: { id: string; label: string; segments: { key: StatusKey; value: number }[] }[];
  }) {
    const totals = rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0));
    const max = Math.max(1, ...totals);
    if (rows.length === 0) {
      return (
        <div className="rounded-md border p-3">
          <h4 className="font-medium text-sm mb-2">{title}</h4>
          <p className="text-xs text-gray-500">No data.</p>
        </div>
      );
    }
    return (
      <div className="rounded-md border p-3">
        <h4 className="font-medium text-sm mb-3">{title}</h4>
        <div className="space-y-2">
          {rows.map((r, idx) => {
            const total = totals[idx];
            return (
              <div key={r.id} className="text-xs">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="truncate pr-2" title={r.label}>
                    {r.label}
                  </span>
                  <span className="font-semibold tabular-nums">{total}</span>
                </div>
                <div className="flex h-4 w-full overflow-hidden rounded bg-gray-100">
                  {r.segments.map((seg) =>
                    seg.value > 0 ? (
                      <div
                        key={seg.key}
                        title={`${STATUS_META[seg.key].label}: ${seg.value}`}
                        style={{
                          width: `${(total / max) * (seg.value / total) * 100}%`,
                          background: STATUS_META[seg.key].bg,
                        }}
                      />
                    ) : null
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
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
          {siteOptions.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] uppercase tracking-wide text-gray-500">
                  Filter by site {selectedSites.size > 0 && `(${selectedSites.size})`}
                </span>
                {selectedSites.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedSites(new Set())}
                    className="text-[11px] text-gray-500 hover:text-gray-700 underline"
                  >
                    Clear sites
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {siteOptions.map((s) => {
                  const active = selectedSites.has(s);
                  const label = s === NO_SITE ? "(No site)" : s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggle(selectedSites, s, setSelectedSites)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                        active
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
          {departmentOptions.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] uppercase tracking-wide text-gray-500">
                  Filter by department {selectedDepartments.size > 0 && `(${selectedDepartments.size})`}
                </span>
                {selectedDepartments.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDepartments(new Set())}
                    className="text-[11px] text-gray-500 hover:text-gray-700 underline"
                  >
                    Clear departments
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {departmentOptions.map((d) => {
                  const active = selectedDepartments.has(d);
                  const label = d === NO_DEPT ? "(No department)" : d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggle(selectedDepartments, d, setSelectedDepartments)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                        active
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
          Generate
        </button>
        {generated && tableUsers.length > 0 && tableAuths.length > 0 && (
          <>
            <div className="inline-flex rounded-md border overflow-hidden">
              <button
                type="button"
                onClick={() => setView("matrix")}
                className={`px-3 py-2 text-sm ${view === "matrix" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
              >
                Matrix
              </button>
              <button
                type="button"
                onClick={() => setView("charts")}
                className={`px-3 py-2 text-sm border-l ${view === "charts" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
              >
                Charts
              </button>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={exportPdf}
              className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Export PDF
            </button>
          </>
        )}
        <div className="flex items-center gap-3 ml-auto text-xs">
          {(["in_date", "due_soon", "overdue", "never"] as StatusKey[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className="inline-block w-4 h-4 rounded"
                style={{ background: STATUS_META[s].bg }}
              />
              {STATUS_META[s].label}
            </span>
          ))}
        </div>
      </div>

      {/* Status filter — visible before & after Generate so users can shape the output up front */}
      {(selectedUsers.size > 0 || selectedAuths.size > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-gray-50 px-3 py-2">
          <span className="text-sm font-medium mr-1">Include statuses:</span>
          {(["overdue", "due_soon", "in_date", "never"] as StatusKey[]).map((s) => {
            const on = visibleStatuses.has(s);
            const meta = STATUS_META[s];
            const count = generated ? stats.totals[s] : null;
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className="text-xs rounded-full px-3 py-1 border transition"
                style={{
                  background: on ? meta.bg : "#ffffff",
                  color: on ? meta.text : "#374151",
                  borderColor: meta.bg,
                }}
              >
                {meta.label}
                {count !== null && ` (${count})`}
              </button>
            );
          })}
          {generated && (hiddenUsersCount > 0 || hiddenAuthsCount > 0) && (
            <span className="text-xs text-gray-600 ml-2">
              {hiddenUsersCount > 0 && `${hiddenUsersCount} staff`}
              {hiddenUsersCount > 0 && hiddenAuthsCount > 0 && " and "}
              {hiddenAuthsCount > 0 && `${hiddenAuthsCount} authorisation${hiddenAuthsCount === 1 ? "" : "s"}`}
              {" hidden by status filter"}
            </span>
          )}
        </div>
      )}

      {/* Output */}
      {generated && (
        <>
          {baseUsers.length === 0 || baseAuths.length === 0 ? (
            <p className="text-sm text-gray-600">
              Select at least one staff member and one authorisation, then click Generate.
            </p>
          ) : tableUsers.length === 0 || tableAuths.length === 0 ? (
            <div className="rounded-md border bg-amber-50 border-amber-200 px-4 py-3 text-sm text-amber-900">
              No staff or authorisations match the selected statuses. Turn on more statuses above to show results.
            </div>
          ) : view === "matrix" ? (
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
                          const info = cellInfo(userComps[a.id]);
                          return (
                            <td
                              key={a.id}
                              className="border px-1 py-1 text-center font-medium"
                              style={{
                                background: info.bg,
                                color: info.text,
                                minWidth: 110,
                                maxWidth: 140,
                              }}
                              title={info.title}
                            >
                              {info.label}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // CHARTS VIEW
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["overdue", "due_soon", "in_date", "never"] as StatusKey[]).map((s) => {
                  const meta = STATUS_META[s];
                  const total = tableUsers.length * tableAuths.length;
                  const pct = total > 0 ? Math.round((stats.totals[s] / total) * 100) : 0;
                  const on = visibleStatuses.has(s);
                  return (
                    <button
                      type="button"
                      key={s}
                      onClick={() => toggleStatus(s)}
                      className={`text-left rounded-md border p-3 transition ${
                        on ? "hover:bg-gray-50" : "opacity-40 hover:opacity-60"
                      }`}
                      style={{ borderLeft: `6px solid ${meta.bg}` }}
                      title={on ? `Click to hide ${meta.label}` : `Click to show ${meta.label}`}
                    >
                      <div className="text-xs text-gray-500">
                        {meta.label}{!on && " (hidden)"}
                      </div>
                      <div className="text-2xl font-bold tabular-nums">{stats.totals[s]}</div>
                      <div className="text-xs text-gray-500">{pct}% of cells</div>
                    </button>
                  );
                })}
              </div>

              {/* Bar charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HBarChart
                  title="Staff — by selected statuses (top 25)"
                  rows={tableUsers
                    .map((u) => {
                      const counts = stats.perUser.get(u.id) || {
                        in_date: 0,
                        due_soon: 0,
                        overdue: 0,
                        never: 0,
                      };
                      const segments = (Array.from(visibleStatuses) as StatusKey[]).map(
                        (k) => ({ key: k, value: counts[k] })
                      );
                      return {
                        id: u.id,
                        label: u.full_name || u.email || "",
                        segments,
                        total: segments.reduce((s, x) => s + x.value, 0),
                      };
                    })
                    .filter((r) => r.total > 0)
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 25)
                    .map(({ id, label, segments }) => ({ id, label, segments }))}
                />
                <HBarChart
                  title="Authorisations — by selected statuses (top 25)"
                  rows={tableAuths
                    .map((a) => {
                      const counts = stats.perAuth.get(a.id) || {
                        in_date: 0,
                        due_soon: 0,
                        overdue: 0,
                        never: 0,
                      };
                      const segments = (Array.from(visibleStatuses) as StatusKey[]).map(
                        (k) => ({ key: k, value: counts[k] })
                      );
                      return {
                        id: a.id,
                        label: a.title,
                        segments,
                        total: segments.reduce((s, x) => s + x.value, 0),
                      };
                    })
                    .filter((r) => r.total > 0)
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 25)
                    .map(({ id, label, segments }) => ({ id, label, segments }))}
                />
              </div>

              {/* Detail list */}
              <div className="rounded-md border">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
                  <h4 className="font-medium text-sm">
                    Matching cells ({sortedMatches.length})
                  </h4>
                  <span className="text-xs text-gray-500">
                    Toggle status chips above to filter.
                  </span>
                </div>
                <div className="max-h-96 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-white border-b sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2">Status</th>
                        <th className="text-left px-3 py-2">Staff</th>
                        <th className="text-left px-3 py-2">Authorisation</th>
                        <th className="text-left px-3 py-2">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMatches.slice(0, 500).map(([uid, aid, status, detail], i) => {
                        const meta = STATUS_META[status];
                        const u = userById.get(uid);
                        const a = authById.get(aid);
                        if (!u || !a) return null;
                        return (
                          <tr key={`${uid}_${aid}`} className="border-b last:border-b-0">
                            <td className="px-3 py-1.5">
                              <span
                                className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold"
                                style={{ background: meta.bg, color: meta.text }}
                              >
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-3 py-1.5">
                              {u.full_name || u.email}
                              {u.site_name && (
                                <span className="text-gray-500"> — {u.site_name}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">
                              {a.title}
                              {a.department && (
                                <span className="text-gray-500"> — {a.department}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600">{detail}</td>
                          </tr>
                        );
                      })}
                      {sortedMatches.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                            No cells match the selected statuses.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {sortedMatches.length > 500 && (
                    <div className="px-3 py-2 text-xs text-gray-500 border-t bg-gray-50">
                      Showing first 500 of {sortedMatches.length} — export CSV/PDF for the full list.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const v = m.length === 3
    ? m.split("").map((c) => parseInt(c + c, 16))
    : [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  return [v[0], v[1], v[2]];
}
