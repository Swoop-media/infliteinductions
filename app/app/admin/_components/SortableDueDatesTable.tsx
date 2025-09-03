
"use client";

import { useState, useMemo } from "react";

type CompletedCourseRow = {
  assignment_id: string;
  user_id: string;
  course_id: string;
  completed_at: string;
  full_name: string | null;
  email: string | null;
  course_title: string | null;
  valid_for_days: number | null;
  created_by: string | null;
};

type SortKey = 'trainee' | 'course' | 'completed' | 'due_date' | 'status';
type SortDirection = 'asc' | 'desc';

export default function SortableDueDatesTable({ 
  completedCourses 
}: { 
  completedCourses: CompletedCourseRow[] 
}) {
  const [sortKey, setSortKey] = useState<SortKey>('due_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  function calculateDueDate(completedAt: string, validForDays: number | null): string {
    if (!validForDays) return "No expiry";

    const completedDate = new Date(completedAt);
    const dueDate = new Date(completedDate);
    dueDate.setDate(dueDate.getDate() + validForDays);

    return dueDate.toLocaleDateString();
  }

  function getDaysUntilDue(completedAt: string, validForDays: number | null): number | null {
    if (!validForDays) return null;

    const completedDate = new Date(completedAt);
    const dueDate = new Date(completedDate);
    dueDate.setDate(dueDate.getDate() + validForDays);

    const today = new Date();
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const sortedCourses = useMemo(() => {
    return [...completedCourses].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortKey) {
        case 'trainee':
          aValue = a.full_name || '';
          bValue = b.full_name || '';
          break;
        case 'course':
          aValue = a.course_title || '';
          bValue = b.course_title || '';
          break;
        case 'completed':
          aValue = new Date(a.completed_at);
          bValue = new Date(b.completed_at);
          break;
        case 'due_date':
          const aDays = getDaysUntilDue(a.completed_at, a.valid_for_days);
          const bDays = getDaysUntilDue(b.completed_at, b.valid_for_days);
          
          // Handle null values (no expiry) - put them at the end
          if (aDays === null && bDays === null) return 0;
          if (aDays === null) return 1;
          if (bDays === null) return -1;
          
          aValue = aDays;
          bValue = bDays;
          break;
        case 'status':
          const aStatus = getDaysUntilDue(a.completed_at, a.valid_for_days);
          const bStatus = getDaysUntilDue(b.completed_at, b.valid_for_days);
          
          // Sort by priority: expired (negative), expiring soon (0-30), then current (>30), then no expiry (null)
          const getStatusPriority = (days: number | null) => {
            if (days === null) return 4; // No expiry - lowest priority
            if (days < 0) return 1; // Expired - highest priority
            if (days <= 30) return 2; // Expiring soon
            return 3; // Current
          };
          
          aValue = getStatusPriority(aStatus);
          bValue = getStatusPriority(bStatus);
          
          // If same priority, sort by days (for expired/expiring)
          if (aValue === bValue && aStatus !== null && bStatus !== null) {
            aValue = aStatus;
            bValue = bStatus;
          }
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const result = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? result : -result;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [completedCourses, sortKey, sortDirection]);

  if (completedCourses.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        No completed courses found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse rounded-md border">
        <thead className="bg-gray-50">
          <tr>
            <th 
              className="px-4 py-3 text-left font-medium text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
              onClick={() => handleSort('trainee')}
              title="Click to sort by trainee name"
            >
              Trainee {getSortIcon('trainee')}
            </th>
            <th 
              className="px-4 py-3 text-left font-medium text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
              onClick={() => handleSort('course')}
              title="Click to sort by course name"
            >
              Course {getSortIcon('course')}
            </th>
            <th 
              className="px-4 py-3 text-left font-medium text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
              onClick={() => handleSort('completed')}
              title="Click to sort by completion date"
            >
              Completed {getSortIcon('completed')}
            </th>
            <th 
              className="px-4 py-3 text-left font-medium text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
              onClick={() => handleSort('due_date')}
              title="Click to sort by due date (soonest first)"
            >
              Due Date {getSortIcon('due_date')}
            </th>
            <th 
              className="px-4 py-3 text-left font-medium text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
              onClick={() => handleSort('status')}
              title="Click to sort by status (expired first, then expiring soon)"
            >
              Status {getSortIcon('status')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {sortedCourses.map((course) => {
            const completedDate = new Date(course.completed_at).toLocaleDateString();
            const dueDate = calculateDueDate(course.completed_at, course.valid_for_days);
            const daysUntilDue = getDaysUntilDue(course.completed_at, course.valid_for_days);

            let statusColor = "text-green-600";
            let statusText = "Current";

            if (daysUntilDue !== null) {
              if (daysUntilDue < 0) {
                statusColor = "text-red-600";
                statusText = `Expired (${Math.abs(daysUntilDue)} days ago)`;
              } else if (daysUntilDue <= 30) {
                statusColor = "text-yellow-600";
                statusText = `Expires in ${daysUntilDue} days`;
              } else {
                statusText = `Expires in ${daysUntilDue} days`;
              }
            }

            return (
              <tr key={course.assignment_id} className="hover:bg-gray-50">
                <td className="border-b px-4 py-3">
                  <div className="font-medium">{course.full_name ?? "Unknown"}</div>
                  <div className="text-xs text-gray-500">{course.email}</div>
                </td>
                <td className="border-b px-4 py-3">
                  <div className="font-medium">{course.course_title}</div>
                  <div className="text-xs text-gray-500">
                    Valid for: {course.valid_for_days ? `${course.valid_for_days} day${course.valid_for_days > 1 ? 's' : ''}` : 'No expiry'}
                  </div>
                </td>
                <td className="border-b px-4 py-3 text-sm">{completedDate}</td>
                <td className="border-b px-4 py-3 text-sm">{dueDate}</td>
                <td className={`border-b px-4 py-3 text-sm font-medium ${statusColor}`}>
                  {statusText}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
