// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import DeleteAuthorisationButton from "./DeleteAuthorisationButton";

type AuthzRow = {
  id: string;
  title: string | null;
  status: "draft" | "active" | "archived";
  updated_at: string;
  created_at: string;
  department: string | null;
};

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "amber" | "gray";
}) {
  const tones: Record<string, string> = {
    default: "bg-gray-100 text-gray-800",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    gray: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function statusTone(status: AuthzRow["status"]) {
  switch (status) {
    case "active":
      return "green";
    case "draft":
      return "gray";
    case "archived":
      return "amber";
    default:
      return "default";
  }
}

export default function FilteredAuthorisationList({ 
  authorisations
}: { 
  authorisations: AuthzRow[];
}) {
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Extract unique departments from authorisations
  const departments = useMemo(() => {
    const deptSet = new Set<string>();
    authorisations.forEach(auth => {
      if (auth.department) {
        deptSet.add(auth.department);
      }
    });
    return Array.from(deptSet).sort();
  }, [authorisations]);

  // Filter authorisations based on selected department and search query
  const filteredAuthorisations = useMemo(() => {
    let filtered = authorisations;
    
    // Apply department filter
    if (selectedDepartment === "none") {
      filtered = filtered.filter(a => !a.department);
    } else if (selectedDepartment !== "all") {
      filtered = filtered.filter(a => a.department === selectedDepartment);
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(a => 
        a.title?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [authorisations, selectedDepartment, searchQuery]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Authorisations</h2>
          
          {/* Department Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="auth-department-filter" className="text-sm text-gray-600">
              Department:
            </label>
            <select
              id="auth-department-filter"
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

          {/* Search Box */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search authorisations..."
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
          href="/app/creator/authorisations/new"
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Create Authorisation
        </Link>
      </div>

      {/* Results count */}
      {(selectedDepartment !== "all" || searchQuery) && (
        <p className="text-sm text-gray-600">
          Showing {filteredAuthorisations.length} of {authorisations.length} authorisations
          {selectedDepartment === "none" && " (no department assigned)"}
          {selectedDepartment !== "all" && selectedDepartment !== "none" && ` in ${selectedDepartment}`}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      )}

      {filteredAuthorisations.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {selectedDepartment === "all" 
            ? "No authorisations yet. Click Create Authorisation to add one."
            : `No authorisations found for ${selectedDepartment === "none" ? "authorisations without a department" : selectedDepartment}.`
          }
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {filteredAuthorisations.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/app/creator/authorisations/${a.id}`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {a.title || "Untitled"}
                  </Link>
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  {a.department && (
                    <span className="text-xs text-gray-500 bg-blue-50 px-2 py-0.5 rounded">
                      {a.department}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  Updated {new Date(a.updated_at || a.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/app/creator/authorisations/${a.id}`}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Edit
                </Link>
                <DeleteAuthorisationButton authId={a.id} title={a.title ?? undefined} />
                <Link
                  href={`/app/creator/authorisations/${a.id}?tab=assignments`}
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