// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type SortField = 'trainee' | 'course' | 'department' | 'completed' | 'due_date' | 'status';
type SortDirection = 'asc' | 'desc';

interface CompletedCourse {
  assignment_id: string;
  user_id: string;
  completed_at: string;
  title: string;
  department?: string;
  valid_for_days: number;
  retake_reminder_days: number;
  new_due_date: string;
  days_until_expiry: string;
  notification_status: string;
  trainee_email?: string;
  trainee_name?: string;
}

interface Props {
  completedCourses: CompletedCourse[];
}

// Consistent date formatting function
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    // Use ISO string format to avoid locale differences
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

// Function to display days remaining or overdue status
const getStatusDisplay = (daysUntilExpiry: number) => {
    if (daysUntilExpiry < 0) {
      return <span className="text-red-600 font-medium">{Math.abs(daysUntilExpiry)} days overdue</span>;
    } else if (daysUntilExpiry === 0) {
      return <span className="text-red-600 font-medium">Due today</span>;
    } else if (daysUntilExpiry <= 30) {
      return <span className="text-yellow-600 font-medium">{daysUntilExpiry} days remaining</span>;
    } else {
      return <span className="text-green-600 font-medium">{daysUntilExpiry} days remaining</span>;
    }
  };

export default function SortableDueDatesTable({ completedCourses }: Props) {
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
    if (!sortField) return completedCourses;

    return [...completedCourses].sort((a, b) => {
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
        case 'completed':
          aValue = new Date(a.completed_at).getTime();
          bValue = new Date(b.completed_at).getTime();
          break;
        case 'due_date':
          aValue = new Date(a.new_due_date).getTime();
          bValue = new Date(b.new_due_date).getTime();
          break;
        case 'status':
          // Sorting by days_until_expiry for a more meaningful status sort
          aValue = parseInt(a.days_until_expiry, 10);
          bValue = parseInt(b.days_until_expiry, 10);
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
  }, [completedCourses, sortField, sortDirection]);

  if (completedCourses.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        No completed courses found.
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
              onClick={() => handleSort('completed')}
            >
              <div className="flex items-center justify-between">
                Completed
                {getSortIcon('completed', sortField, sortDirection)}
              </div>
            </th>
            <th
              className="border-b border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('due_date')}
            >
              <div className="flex items-center justify-between">
                Due Date
                {getSortIcon('due_date', sortField, sortDirection)}
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
                <div className="text-xs text-gray-500">
                  Valid for {course.valid_for_days} days
                </div>
              </td>
              <td className="border-b px-4 py-3 text-sm">
                {course.department || '—'}
              </td>
              <td className="border-b px-4 py-3 text-sm">
                {formatDate(course.completed_at)}
              </td>
              <td className="border-b px-4 py-3 text-sm">
                {formatDate(course.new_due_date)}
              </td>
              <td className="px-4 py-3 text-sm">
                {getStatusDisplay(parseInt(course.days_until_expiry))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}