'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronDown, Check } from 'lucide-react';

interface UserItem {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
}

interface BatchUserAssignmentProps {
  users: UserItem[];
  assignedUserIds: Set<string>;
  acknowledgedUserIds: Set<string>;
  requireAcknowledgement: boolean;
  noticeId: string;
  bulkAssignAction: (formData: FormData) => Promise<void>;
  revokeAction: (formData: FormData) => Promise<void>;
}

export default function BatchUserAssignment({
  users,
  assignedUserIds,
  acknowledgedUserIds,
  requireAcknowledgement,
  noticeId,
  bulkAssignAction,
  revokeAction,
}: BatchUserAssignmentProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(assignedUserIds));
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIds(new Set(assignedUserIds));
  }, [assignedUserIds]);

  const departmentGroups = useMemo(() => {
    const groups = new Map<string, UserItem[]>();
    
    const filteredUsers = users.filter(user => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        (user.full_name?.toLowerCase().includes(query)) ||
        (user.email?.toLowerCase().includes(query))
      );
    });

    filteredUsers.forEach(user => {
      const dept = user.department || 'No Department';
      if (!groups.has(dept)) {
        groups.set(dept, []);
      }
      groups.get(dept)!.push(user);
    });

    const sortedEntries = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === 'No Department') return 1;
      if (b[0] === 'No Department') return -1;
      return a[0].localeCompare(b[0]);
    });

    return new Map(sortedEntries);
  }, [users, searchQuery]);

  const toggleDepartment = (dept: string) => {
    const newExpanded = new Set(expandedDepartments);
    if (newExpanded.has(dept)) {
      newExpanded.delete(dept);
    } else {
      newExpanded.add(dept);
    }
    setExpandedDepartments(newExpanded);
  };

  const handleUserToggle = (userId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAllInDepartment = (dept: string) => {
    const deptUsers = departmentGroups.get(dept) || [];
    const deptUserIds = deptUsers.map(u => u.id);
    const allSelected = deptUserIds.every(id => selectedIds.has(id));
    
    const newSelected = new Set(selectedIds);
    if (allSelected) {
      deptUserIds.forEach(id => newSelected.delete(id));
    } else {
      deptUserIds.forEach(id => newSelected.add(id));
    }
    setSelectedIds(newSelected);
  };

  const handleExpandAll = () => {
    const allDepts = Array.from(departmentGroups.keys());
    setExpandedDepartments(new Set(allDepts));
  };

  const handleCollapseAll = () => {
    setExpandedDepartments(new Set());
  };

  const handleSaveAssignments = () => {
    setSaveMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('notice_id', noticeId);
      selectedIds.forEach(id => {
        formData.append('user_ids', id);
      });
      await bulkAssignAction(formData);
      setSaveMessage('Assignments saved successfully.');
      router.refresh();
      setTimeout(() => setSaveMessage(null), 3000);
    });
  };

  const newlySelectedCount = Array.from(selectedIds).filter(id => !assignedUserIds.has(id)).length;
  const removedCount = Array.from(assignedUserIds).filter(id => !selectedIds.has(id)).length;
  const hasChanges = newlySelectedCount > 0 || removedCount > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users by name or email..."
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExpandAll}
            className="text-xs text-gray-600 hover:text-gray-900"
          >
            Expand All
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="text-xs text-gray-600 hover:text-gray-900"
          >
            Collapse All
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {selectedIds.size} user{selectedIds.size !== 1 ? 's' : ''} selected
          {hasChanges && (
            <span className="ml-2 text-amber-600">
              ({newlySelectedCount > 0 && `+${newlySelectedCount} new`}
              {newlySelectedCount > 0 && removedCount > 0 && ', '}
              {removedCount > 0 && `-${removedCount} removed`})
            </span>
          )}
        </span>
        <span>{users.length} total users</span>
      </div>

      <div className="space-y-2 max-h-[500px] overflow-y-auto border rounded-md">
        {Array.from(departmentGroups.entries()).map(([dept, deptUsers]) => {
          const isExpanded = expandedDepartments.has(dept);
          const deptSelectedCount = deptUsers.filter(u => selectedIds.has(u.id)).length;
          const allDeptSelected = deptUsers.length > 0 && deptSelectedCount === deptUsers.length;
          const someDeptSelected = deptSelectedCount > 0 && !allDeptSelected;
          
          return (
            <div key={dept} className="border-b last:border-b-0">
              <div className="flex items-center justify-between p-3 bg-gray-50">
                <button
                  type="button"
                  onClick={() => toggleDepartment(dept)}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                  <span className="font-medium text-sm">
                    {dept} ({deptUsers.length})
                  </span>
                  {deptSelectedCount > 0 && (
                    <span className="text-xs text-gray-500">
                      - {deptSelectedCount} selected
                    </span>
                  )}
                </button>
                
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allDeptSelected}
                    ref={input => {
                      if (input) {
                        input.indeterminate = someDeptSelected;
                      }
                    }}
                    onChange={() => handleSelectAllInDepartment(dept)}
                    className="mr-2 rounded border-gray-300"
                  />
                  <span className="text-xs text-gray-600">Select all</span>
                </label>
              </div>
              
              {isExpanded && (
                <div className="divide-y">
                  {deptUsers.map(user => {
                    const isSelected = selectedIds.has(user.id);
                    const wasAssigned = assignedUserIds.has(user.id);
                    const hasAcknowledged = acknowledgedUserIds.has(user.id);
                    
                    return (
                      <label
                        key={user.id}
                        className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleUserToggle(user.id)}
                            className="rounded border-gray-300"
                          />
                          <div>
                            <div className="text-sm font-medium">
                              {user.full_name || 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {user.email}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {wasAssigned && !isSelected && (
                            <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">
                              Will be removed
                            </span>
                          )}
                          {!wasAssigned && isSelected && (
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                              New
                            </span>
                          )}
                          {wasAssigned && isSelected && requireAcknowledgement && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              hasAcknowledged 
                                ? 'text-green-700 bg-green-100' 
                                : 'text-amber-700 bg-amber-100'
                            }`}>
                              {hasAcknowledged ? (
                                <span className="flex items-center gap-1">
                                  <Check className="h-3 w-3" /> Acknowledged
                                </span>
                              ) : 'Pending'}
                            </span>
                          )}
                          {wasAssigned && isSelected && !requireAcknowledgement && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                              Assigned
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        
        {departmentGroups.size === 0 && (
          <div className="p-6 text-center text-gray-500 text-sm">
            No users found matching your search.
          </div>
        )}
      </div>

      {saveMessage && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          {saveMessage}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <div className="text-sm text-gray-500">
          {requireAcknowledgement && (
            <span>Acknowledgement required for this notice</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSaveAssignments}
          disabled={!hasChanges || isPending}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            hasChanges && !isPending
              ? 'bg-black text-white hover:bg-gray-800'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isPending ? 'Saving...' : 'Save Assignments'}
        </button>
      </div>
    </div>
  );
}
