// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type NoticeRow = {
  id: string;
  title: string | null;
  status: "draft" | "published" | "archived";
  updated_at: string;
  created_at: string;
  department: string | null;
  require_acknowledgement: boolean;
};

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "amber" | "gray" | "blue";
}) {
  const tones: Record<string, string> = {
    default: "bg-gray-100 text-gray-800",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    gray: "bg-gray-100 text-gray-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function statusTone(status: NoticeRow["status"]) {
  switch (status) {
    case "published":
      return "green";
    case "draft":
      return "gray";
    case "archived":
      return "amber";
    default:
      return "default";
  }
}

export default function FilteredOperationsNoticeList({ 
  notices
}: { 
  notices: NoticeRow[];
}) {
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const departments = useMemo(() => {
    const deptSet = new Set<string>();
    notices.forEach(notice => {
      if (notice.department) {
        deptSet.add(notice.department);
      }
    });
    return Array.from(deptSet).sort();
  }, [notices]);

  const filteredNotices = useMemo(() => {
    let filtered = notices;
    
    if (selectedDepartment === "none") {
      filtered = filtered.filter(n => !n.department);
    } else if (selectedDepartment !== "all") {
      filtered = filtered.filter(n => n.department === selectedDepartment);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(n => 
        n.title?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [notices, selectedDepartment, searchQuery]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Operations Notices</h2>
          
          <div className="flex items-center gap-2">
            <label htmlFor="notice-department-filter" className="text-sm text-gray-600">
              Department:
            </label>
            <select
              id="notice-department-filter"
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Departments</option>
              {departments.length > 0 && (
                <>
                  <option value="none">No Department</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search notices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
            />
            {(selectedDepartment !== "all" || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedDepartment("all");
                  setSearchQuery("");
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
        
        <Link
          href="/app/creator/operations-notices/new"
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Create Notice
        </Link>
      </div>

      {(selectedDepartment !== "all" || searchQuery) && (
        <p className="text-sm text-gray-600">
          Showing {filteredNotices.length} of {notices.length} notices
          {selectedDepartment === "none" && " (no department assigned)"}
          {selectedDepartment !== "all" && selectedDepartment !== "none" && ` in ${selectedDepartment}`}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      )}

      {filteredNotices.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {selectedDepartment === "all" && !searchQuery
            ? "No operations notices yet. Click Create Notice to get started."
            : `No notices found matching your criteria.`
          }
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {filteredNotices.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/app/creator/operations-notices/${n.id}`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {n.title || "Untitled"}
                  </Link>
                  <Badge tone={statusTone(n.status)}>{n.status}</Badge>
                  {n.require_acknowledgement && (
                    <Badge tone="blue">Requires Acknowledgement</Badge>
                  )}
                  {n.department && (
                    <span className="text-xs text-gray-500 bg-blue-50 px-2 py-0.5 rounded">
                      {n.department}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  Updated {new Date(n.updated_at || n.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/app/creator/operations-notices/${n.id}`}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Edit
                </Link>
                <Link
                  href={`/app/creator/operations-notices/${n.id}/delete`}
                  className="rounded-md border px-3 py-1.5 text-sm border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                >
                  Delete
                </Link>
                <Link
                  href={`/app/creator/operations-notices/${n.id}?tab=assignments`}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Assign
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
