// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type CourseRow = {
  id: string;
  title: string | null;
  status: "draft" | "published" | "archived";
  updated_at: string;
  created_at: string;
  tags: string[] | null;
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

function statusTone(status: CourseRow["status"]) {
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

export default function FilteredCourseList({ 
  courses,
  duplicateCourseAction
}: { 
  courses: CourseRow[];
  duplicateCourseAction: any;
}) {
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");

  // Extract unique departments from courses
  const departments = useMemo(() => {
    const deptSet = new Set<string>();
    courses.forEach(course => {
      if (course.department) {
        deptSet.add(course.department);
      }
    });
    return Array.from(deptSet).sort();
  }, [courses]);

  // Filter courses based on selected department
  const filteredCourses = useMemo(() => {
    if (selectedDepartment === "all") {
      return courses;
    }
    if (selectedDepartment === "none") {
      return courses.filter(c => !c.department);
    }
    return courses.filter(c => c.department === selectedDepartment);
  }, [courses, selectedDepartment]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Courses</h2>
          
          {/* Department Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="department-filter" className="text-sm text-gray-600">
              Department:
            </label>
            <select
              id="department-filter"
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
            {selectedDepartment !== "all" && (
              <button
                onClick={() => setSelectedDepartment("all")}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        <Link
          href="/app/creator/courses/new"
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Create Course
        </Link>
      </div>

      {/* Results count */}
      {selectedDepartment !== "all" && (
        <p className="text-sm text-gray-600">
          Showing {filteredCourses.length} of {courses.length} courses
          {selectedDepartment === "none" ? " (no department assigned)" : ` in ${selectedDepartment}`}
        </p>
      )}

      {filteredCourses.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {selectedDepartment === "all" 
            ? "No courses yet. Click Create Course to get started."
            : `No courses found for ${selectedDepartment === "none" ? "courses without a department" : selectedDepartment}.`
          }
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {filteredCourses.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/app/creator/courses/${c.id}`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {c.title || "Untitled"}
                  </Link>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  {c.department && (
                    <span className="text-xs text-gray-500 bg-blue-50 px-2 py-0.5 rounded">
                      {c.department}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  Updated {new Date(c.updated_at || c.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                  {Array.isArray(c.tags) && c.tags.length > 0 && (
                    <>
                      {" · "}
                      {c.tags.slice(0, 3).map((t, i) => (
                        <span key={t + i} className="mr-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px]">
                          {t}
                        </span>
                      ))}
                      {c.tags.length > 3 && <span className="text-[10px]">+{c.tags.length - 3}</span>}
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/app/creator/courses/${c.id}`}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Edit
                </Link>
                {/* Duplicate functionality temporarily disabled
                <form action={duplicateCourseAction} className="inline">
                  <input type="hidden" name="courseId" value={c.id} />
                  <button
                    type="submit"
                    className="rounded-md border px-3 py-1.5 text-sm border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    Duplicate
                  </button>
                </form>
                */}
                <Link
                  href={`/app/creator/courses/${c.id}/delete`}
                  className="rounded-md border px-3 py-1.5 text-sm border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                >
                  Delete
                </Link>
                <Link
                  href={`/app/creator/courses/${c.id}?tab=assignments`}
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