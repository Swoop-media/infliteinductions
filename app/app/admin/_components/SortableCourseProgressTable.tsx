// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type SortField = 'trainee' | 'course' | 'department' | 'assigned' | 'status';
type SortDirection = 'asc' | 'desc';

interface InProgressCourse {
  assignment_id: string;
  user_id: string;
  assigned_at: string;
  title: string;
  department?: string;
  assignment_status: string;
  trainee_email?: string;
  trainee_name?: string;
}

interface Props {
  inProgressCourses: InProgressCourse[];
}

// Consistent date formatting function
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return dateString;
  }
}

// Sort icon helper function
function getSortIcon(column: SortField, sortField: SortField | null, sortDirection: SortDirection) {
  if (sortField !== column) {
    return <ChevronsUpDown className="h-4 w-4 text-gray-400" />;
  }
  return sortDirection === 'asc'
    ? <ChevronUp className="h-4 w-4 text-blue-600" />
    : <ChevronDown className="h-4 w-4 text-blue-600" />;
}

// Function to display assignment status
const getStatusDisplay = (status: string) => {
  switch (status) {
    case 'assigned':
      return <span className="text-blue-600 font-medium">Not Started</span>;
    case 'in_progress':
      return <span className="text-yellow-600 font-medium">In Progress</span>;
    default:
      return <span className="text-gray-600 font-medium">{status}</span>;
  }
};

export default function SortableCourseProgressTable({ inProgressCourses }: Props) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortField) return inProgressCourses;

    return [...inProgressCourses].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'trainee':
          aValue = a.trainee_name || a.trainee_email || '';
          bValue = b.trainee_name || b.trainee_email || '';
          break;
        case 'course':
          aValue = a.title;
          bValue = b.title;
          break;
        case 'department':
          aValue = a.department || '';
          bValue = b.department || '';
          break;
        case 'assigned':
          aValue = new Date(a.assigned_at).getTime();
          bValue = new Date(b.assigned_at).getTime();
          break;
        case 'status':
          aValue = a.assignment_status;
          bValue = b.assignment_status;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortDirection === 'asc'
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });
  }, [inProgressCourses, sortField, sortDirection]);

  if (inProgressCourses.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        No in-progress courses found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-50">
            <th
              className="border-b border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('trainee')}
            >
              <div className="flex items-center justify-between">
                Trainee
                {getSortIcon('trainee', sortField, sortDirection)}
              </div>
            </th>
            <th
              className="border-b border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('course')}
            >
              <div className="flex items-center justify-between">
                Course
                {getSortIcon('course', sortField, sortDirection)}
              </div>
            </th>
            <th
              className="border-b border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('department')}
            >
              <div className="flex items-center justify-between">
                Department
                {getSortIcon('department', sortField, sortDirection)}
              </div>
            </th>
            <th
              className="border-b border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('assigned')}
            >
              <div className="flex items-center justify-between">
                Assigned
                {getSortIcon('assigned', sortField, sortDirection)}
              </div>
            </th>
            <th
              className="border-b border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('status')}
            >
              <div className="flex items-center justify-between">
                Status
                {getSortIcon('status', sortField, sortDirection)}
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {sortedData.map((course) => (
            <tr key={course.assignment_id} className="hover:bg-gray-50">
              <td className="border-b px-4 py-3 text-sm">
                {course.trainee_name || course.trainee_email || 'Unknown'}
              </td>
              <td className="border-b px-4 py-3 text-sm">
                {course.title}
              </td>
              <td className="border-b px-4 py-3 text-sm">
                {course.department || '—'}
              </td>
              <td className="border-b px-4 py-3 text-sm">
                {formatDate(course.assigned_at)}
              </td>
              <td className="px-4 py-3 text-sm">
                {getStatusDisplay(course.assignment_status)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}