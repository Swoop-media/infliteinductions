'use client';

import { useState } from 'react';
import DepartmentAssignmentBase, { AssignmentItem } from '../DepartmentAssignmentBase';

interface AssignmentSectionsProps {
  authorizations: AssignmentItem[];
  courses: AssignmentItem[];
}

export default function AssignmentSections({ authorizations, courses }: AssignmentSectionsProps) {
  // Manage selected state for each section
  const [selectedAuthIds, setSelectedAuthIds] = useState<string[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  
  return (
    <>
      {/* Authorizations Section (Top) */}
      {authorizations.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-medium">Assign Authorizations</h2>
          <DepartmentAssignmentBase
            items={authorizations}
            selectedIds={selectedAuthIds}
            onSelectionChange={setSelectedAuthIds}
            inputName="authorization_ids"
            renderMode="form-inputs"
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
            onSelectionChange={setSelectedCourseIds}
            inputName="course_ids"
            renderMode="form-inputs"
          />
        </div>
      )}
    </>
  );
}