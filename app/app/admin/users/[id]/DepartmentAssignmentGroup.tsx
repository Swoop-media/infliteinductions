'use client';

import { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface AssignmentItem {
  id: string;
  title: string;
  department?: string | null;
}

interface DepartmentAssignmentGroupProps {
  title: string;
  items: AssignmentItem[];
  inputName: string;
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  buttonText: string;
  buttonClassName?: string;
  formAction: string;
  userId: string;
}

export default function DepartmentAssignmentGroup({
  title,
  items,
  inputName,
  selectedIds = [],
  onSelectionChange,
  buttonText,
  buttonClassName = "rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700",
  formAction,
  userId
}: DepartmentAssignmentGroupProps) {
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set(selectedIds));

  // Sync localSelectedIds with external selectedIds prop and prune invalid selections
  useEffect(() => {
    const validItemIds = new Set(items.map(item => item.id));
    const newSelectedIds = new Set(
      selectedIds.filter(id => validItemIds.has(id))
    );
    setLocalSelectedIds(newSelectedIds);
  }, [selectedIds, items]);

  // Initialize expanded departments - expand any with selected items or the first one
  useEffect(() => {
    const departmentsWithSelections = new Set<string>();
    items.forEach(item => {
      if (localSelectedIds.has(item.id)) {
        departmentsWithSelections.add(item.department || 'Unassigned');
      }
    });

    // If we have departments with selections, expand them
    if (departmentsWithSelections.size > 0) {
      setExpandedDepartments(departmentsWithSelections);
    } else if (items.length > 0) {
      // Otherwise, expand the first department
      const firstDept = items[0].department || 'Unassigned';
      setExpandedDepartments(new Set([firstDept]));
    }
  }, []); // Only run on initial mount

  // Group items by department
  const departmentGroups = useMemo(() => {
    const groups = new Map<string, AssignmentItem[]>();
    
    items.forEach(item => {
      const dept = item.department || 'Unassigned';
      if (!groups.has(dept)) {
        groups.set(dept, []);
      }
      groups.get(dept)!.push(item);
    });

    // Sort departments alphabetically, with 'Unassigned' at the end
    const sortedEntries = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === 'Unassigned') return 1;
      if (b[0] === 'Unassigned') return -1;
      return a[0].localeCompare(b[0]);
    });

    return new Map(sortedEntries);
  }, [items]);

  const toggleDepartment = (dept: string) => {
    const newExpanded = new Set(expandedDepartments);
    if (newExpanded.has(dept)) {
      newExpanded.delete(dept);
    } else {
      newExpanded.add(dept);
    }
    setExpandedDepartments(newExpanded);
  };

  const handleItemToggle = (itemId: string) => {
    const newSelected = new Set(localSelectedIds);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setLocalSelectedIds(newSelected);
    onSelectionChange?.(Array.from(newSelected));
  };

  const handleSelectAllInDepartment = (dept: string) => {
    const deptItems = departmentGroups.get(dept) || [];
    const allSelected = deptItems.every(item => localSelectedIds.has(item.id));
    
    const newSelected = new Set(localSelectedIds);
    deptItems.forEach(item => {
      if (allSelected) {
        newSelected.delete(item.id);
      } else {
        newSelected.add(item.id);
      }
    });
    
    setLocalSelectedIds(newSelected);
    onSelectionChange?.(Array.from(newSelected));
  };

  const getTotalCount = () => items.length;
  const getSelectedCount = () => localSelectedIds.size;

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">
          {title} ({getTotalCount()})
        </h2>
        {getSelectedCount() > 0 && (
          <span className="text-sm text-gray-600">
            {getSelectedCount()} selected
          </span>
        )}
      </div>
      
      <form action={formAction} method="post" className="space-y-3">
        <input type="hidden" name="user_id" value={userId} />
        
        <div className="space-y-2">
          {Array.from(departmentGroups.entries()).map(([dept, deptItems]) => {
            const isExpanded = expandedDepartments.has(dept);
            const deptSelectedCount = deptItems.filter(item => localSelectedIds.has(item.id)).length;
            const allDeptSelected = deptItems.length > 0 && deptSelectedCount === deptItems.length;
            const someDeptSelected = deptSelectedCount > 0 && !allDeptSelected;
            
            return (
              <div key={dept} className="border rounded-md">
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
                      {dept} ({deptItems.length})
                    </span>
                    {deptSelectedCount > 0 && (
                      <span className="text-xs text-gray-500 ml-2">
                        ({deptSelectedCount} selected)
                      </span>
                    )}
                  </button>
                  
                  <label className="flex items-center">
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
                  <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
                    {deptItems.map(item => (
                      <label key={item.id} className="flex items-center hover:bg-gray-50 p-1 rounded">
                        <input
                          type="checkbox"
                          name={inputName}
                          value={item.id}
                          checked={localSelectedIds.has(item.id)}
                          onChange={() => handleItemToggle(item.id)}
                          className="mr-3 rounded border-gray-300"
                        />
                        <span className="text-sm">{item.title}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {getTotalCount() > 0 && (
          <div className="pt-3">
            <button
              type="submit"
              className={buttonClassName}
              disabled={getSelectedCount() === 0}
            >
              {buttonText} {getSelectedCount() > 0 && `(${getSelectedCount()})`}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}