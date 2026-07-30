'use client';

import DepartmentAssignmentBase, { AssignmentItem } from '../DepartmentAssignmentBase';

interface AssignmentSectionsProps {
  authorizations: AssignmentItem[];
  courses: AssignmentItem[];
  selectedAuthIds: string[];
  onAuthSelectionChange: (ids: string[]) => void;
  selectedCourseIds: string[];
  onCourseSelectionChange: (ids: string[]) => void;
}

export default function AssignmentSections({
  authorizations,
  courses,
  selectedAuthIds,
  onAuthSelectionChange,
  selectedCourseIds,
  onCourseSelectionChange,
}: AssignmentSectionsProps) {
  return (
    <>
      {/* Authorizations Section (Top) */}
      {authorizations.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-medium">Assign Authorizations</h2>
          <DepartmentAssignmentBase
            items={authorizations}
            selectedIds={selectedAuthIds}
            onSelectionChange={onAuthSelectionChange}
            renderMode="none"
            defaultCollapsed
          />
        </div>
      )}

      {/* Courses Section (Bottom) */}
      {courses.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-medium">Assign Courses</h2>
          <DepartmentAssignmentBase
            items={courses}
            selectedIds={selectedCourseIds}
            onSelectionChange={onCourseSelectionChange}
            renderMode="none"
            defaultCollapsed
          />
        </div>
      )}
    </>
  );
}