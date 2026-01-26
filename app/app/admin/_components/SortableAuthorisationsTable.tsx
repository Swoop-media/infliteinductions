// @ts-nocheck

"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type SortField = 'trainee' | 'authorisation' | 'department' | 'approved' | 'due_date' | 'status';
type SortDirection = 'asc' | 'desc';

interface AuthorisationCompletionRow {
  assignment_id: string;
  user_id: string;
  authorisation_id: string;
  approved_at: string;
  expires_at: string | null;
  full_name: string | null;
  email: string | null;
  authorisation_title: string | null;
  department: string | null;
  valid_for_days: number | null;
}

interface Props {
  completedAuthorisations: AuthorisationCompletionRow[];
}

// Consistent date formatting function - avoid hydration errors
function formatDate(dateString: string): string {
  try {
    // Parse ISO date string directly without timezone conversion
    // This ensures consistent formatting between server and client
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${day}/${month}/${year}`;
    }
    // Fallback for non-ISO strings
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
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

// Function to calculate days until expiry and return status display
function getStatusDisplay(expiresAt: string | null) {
  if (!expiresAt) {
    return <span className="text-gray-600 font-medium">No expiry</span>;
  }

  const dueDate = new Date(expiresAt);
  const today = new Date();
  const timeDiff = dueDate.getTime() - today.getTime();
  const daysUntilExpiry = Math.ceil(timeDiff / (1000 * 3600 * 24));

  if (daysUntilExpiry < 0) {
    return <span className="text-red-600 font-medium">{Math.abs(daysUntilExpiry)} days overdue</span>;
  } else if (daysUntilExpiry === 0) {
    return <span className="text-red-600 font-medium">Due today</span>;
  } else if (daysUntilExpiry <= 30) {
    return <span className="text-yellow-600 font-medium">{daysUntilExpiry} days remaining</span>;
  } else {
    return <span className="text-green-600 font-medium">{daysUntilExpiry} days remaining</span>;
  }
}

// Function to format due date for display
function displayDueDate(expiresAt: string | null): string {
  if (!expiresAt) return "No expiry";
  return formatDate(expiresAt);
}

// Function to get days until expiry for sorting
function getDaysUntilExpiry(expiresAt: string | null): number {
  if (!expiresAt) return 999999; // No expiry, sort last

  const dueDate = new Date(expiresAt);
  const today = new Date();
  const timeDiff = dueDate.getTime() - today.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
}

export default function SortableAuthorisationsTable({ completedAuthorisations }: Props) {
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
    if (!sortField) return completedAuthorisations;

    return [...completedAuthorisations].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'trainee':
          aValue = a.full_name || a.email || '';
          bValue = b.full_name || b.email || '';
          break;
        case 'authorisation':
          aValue = a.authorisation_title || '';
          bValue = b.authorisation_title || '';
          break;
        case 'department':
          aValue = a.department || '';
          bValue = b.department || '';
          break;
        case 'approved':
          aValue = new Date(a.approved_at).getTime();
          bValue = new Date(b.approved_at).getTime();
          break;
        case 'due_date':
          // For sorting, use the expires_at timestamp
          aValue = a.expires_at ? new Date(a.expires_at).getTime() : 999999999999999;
          bValue = b.expires_at ? new Date(b.expires_at).getTime() : 999999999999999;
          break;
        case 'status':
          aValue = getDaysUntilExpiry(a.expires_at);
          bValue = getDaysUntilExpiry(b.expires_at);
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
  }, [completedAuthorisations, sortField, sortDirection]);

  if (completedAuthorisations.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        No completed authorisations found.
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
              onClick={() => handleSort('authorisation')}
            >
              <div className="flex items-center justify-between">
                Authorisation
                {getSortIcon('authorisation', sortField, sortDirection)}
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
              onClick={() => handleSort('approved')}
            >
              <div className="flex items-center justify-between">
                Approved
                {getSortIcon('approved', sortField, sortDirection)}
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
          {sortedData.map((auth) => (
            <tr key={auth.assignment_id} className="hover:bg-gray-50">
              <td className="border-b px-4 py-3 text-sm">
                {auth.full_name || auth.email || 'Unknown'}
              </td>
              <td className="border-b px-4 py-3 text-sm">
                {auth.authorisation_title}
                <div className="text-xs text-gray-500">
                  Valid for: {auth.valid_for_days ? `${auth.valid_for_days} days` : 'No expiry'}
                </div>
              </td>
              <td className="border-b px-4 py-3 text-sm">
                {auth.department || '—'}
              </td>
              <td className="border-b px-4 py-3 text-sm">
                {formatDate(auth.approved_at)}
              </td>
              <td className="border-b px-4 py-3 text-sm">
                {displayDueDate(auth.expires_at)}
              </td>
              <td className="px-4 py-3 text-sm">
                {getStatusDisplay(auth.expires_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
