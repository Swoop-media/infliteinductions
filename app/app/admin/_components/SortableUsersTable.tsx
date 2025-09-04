"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useRouter } from 'next/navigation';

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department?: string | null;
  job_description?: string | null;
};

type SortField = 'name' | 'email' | 'department';
type SortDirection = 'asc' | 'desc';

interface Props {
  profiles: Profile[];
  roleMap: Map<string, string[]>;
  grantablePool: string[];
}

function getSortIcon(column: SortField, sortField: SortField | null, sortDirection: SortDirection) {
  if (sortField !== column) {
    return <ChevronsUpDown className="h-4 w-4 text-gray-400" />;
  }
  return sortDirection === 'asc'
    ? <ChevronUp className="h-4 w-4 text-blue-600" />
    : <ChevronDown className="h-4 w-4 text-blue-600" />;
}

export default function SortableUsersTable({ profiles, roleMap, grantablePool }: Props) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const router = useRouter();

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedProfiles = useMemo(() => {
    if (!sortField) return profiles;

    return [...profiles].sort((a, b) => {
      let aValue: string;
      let bValue: string;

      switch (sortField) {
        case 'name':
          aValue = a.full_name || '';
          bValue = b.full_name || '';
          break;
        case 'email':
          aValue = a.email || '';
          bValue = b.email || '';
          break;
        case 'department':
          aValue = a.department || '';
          bValue = b.department || '';
          break;
        default:
          return 0;
      }

      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });
  }, [profiles, sortField, sortDirection]);

  const archiveUser = async (userId: string) => {
    if (!confirm("Are you sure you want to archive this user? They will be moved to archived users and hidden from lists.")) {
      return;
    }

    try {
      const response = await fetch("/app/admin/users/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        router.refresh();
      } else {
        alert("Failed to archive user");
      }
    } catch (error) {
      console.error("Error archiving user:", error);
      alert("Error archiving user");
    }
  };


  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th
              className="px-3 py-2 text-left font-medium cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('name')}
            >
              <div className="flex items-center justify-between">
                Name
                {getSortIcon('name', sortField, sortDirection)}
              </div>
            </th>
            <th
              className="px-3 py-2 text-left font-medium cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('email')}
            >
              <div className="flex items-center justify-between">
                Email
                {getSortIcon('email', sortField, sortDirection)}
              </div>
            </th>
            <th
              className="px-3 py-2 text-left font-medium cursor-pointer hover:bg-gray-100"
              onClick={() => handleSort('department')}
            >
              <div className="flex items-center justify-between">
                Department
                {getSortIcon('department', sortField, sortDirection)}
              </div>
            </th>
            <th className="px-3 py-2 text-left font-medium">
              Current Roles
            </th>
            <th className="px-3 py-2 text-left font-medium">
              Grant Role
            </th>
            <th className="px-3 py-2 text-left font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y bg-white">
          {sortedProfiles.map((p) => {
            const roles = roleMap.get(p.id) ?? [];
            const grantable = grantablePool.filter(r => !roles.includes(r));

            return (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">
                  {p.full_name ?? "(no name)"}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {p.email ?? "-"}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {p.department ?? "-"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {roles.length === 0 ? (
                      <span className="text-xs text-gray-400">No roles</span>
                    ) : (
                      roles.map((r) => (
                        <span
                          key={r}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
                        >
                          {r}
                          <form
                            action="/app/admin/users/roles/revoke"
                            method="post"
                            className="inline"
                          >
                            <input type="hidden" name="user_id" value={p.id} />
                            <input type="hidden" name="role" value={r} />
                            <button
                              title="Revoke role"
                              className="ml-1 text-blue-600 hover:text-blue-800"
                            >
                              ×
                            </button>
                          </form>
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <form
                    action="/app/admin/users/roles/grant"
                    method="post"
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="user_id" value={p.id} />
                    <select
                      name="role"
                      className="rounded border px-2 py-1 text-xs"
                      disabled={!grantable.length}
                    >
                      {grantable.length ? (
                        grantable.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))
                      ) : (
                        <option value="" disabled>
                          No more roles
                        </option>
                      )}
                    </select>
                    <button
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
                      disabled={!grantable.length}
                    >
                      Grant
                    </button>
                  </form>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Link
                      href={`/app/admin/users/${p.id}`}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-100"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => archiveUser(p.id)}
                      className="rounded border border-yellow-500 bg-yellow-50 px-2 py-1 text-xs text-yellow-700 hover:bg-yellow-100"
                    >
                      Archive
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}