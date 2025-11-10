'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

export interface AssignmentItem {
  id: string;
  title: string;
  department?: string | null;
}

interface DepartmentAssignmentBaseProps {
  items: AssignmentItem[];
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  inputName?: string; // Optional - only used when rendering actual form inputs
  renderMode?: 'form-inputs' | 'hidden-inputs' | 'none'; // How to render the inputs
}

export default function DepartmentAssignmentBase({
  items,
  selectedIds = [],
  onSelectionChange,
  inputName,
  renderMode = 'form-inputs'
}: DepartmentAssignmentBaseProps) {
  // Local state for expanded departments
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    
    // Expand departments with selected items
    items.forEach(item => {
      if (selectedIds.includes(item.id)) {
        expanded.add(item.department || 'Unassigned');
      }
    });
    
    // If no selections, expand first department
    if (expanded.size === 0 && items.length > 0) {
      const firstDept = items[0].department || 'Unassigned';
      expanded.add(firstDept);
    }
    
    return expanded;
  });

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
    const newSelected = selectedIds.includes(itemId)
      ? selectedIds.filter(id => id !== itemId)
      : [...selectedIds, itemId];
    onSelectionChange(newSelected);
  };

  const handleSelectAllInDepartment = (dept: string) => {
    const deptItems = departmentGroups.get(dept) || [];
    const deptItemIds = deptItems.map(item => item.id);
    const allSelected = deptItemIds.every(id => selectedIds.includes(id));
    
    let newSelected: string[];
    if (allSelected) {
      // Deselect all in department
      newSelected = selectedIds.filter(id => !deptItemIds.includes(id));
    } else {
      // Select all in department
      const existingOtherIds = selectedIds.filter(id => !deptItemIds.includes(id));
      newSelected = [...existingOtherIds, ...deptItemIds];
    }
    onSelectionChange(newSelected);
  };

  const getTotalCount = () => items.length;
  const getSelectedCount = () => selectedIds.filter(id => items.some(item => item.id === id)).length;

  return (
    <>
      {/* Hidden inputs for form submission when in hidden-inputs mode */}
      {renderMode === 'hidden-inputs' && inputName && selectedIds.map(id => (
        <input key={id} type="hidden" name={inputName} value={id} />
      ))}
      
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Total: {getTotalCount()}
          </span>
          {getSelectedCount() > 0 && (
            <span className="text-sm text-gray-600">
              {getSelectedCount()} selected
            </span>
          )}
        </div>
        
        <div className="space-y-2">
          {Array.from(departmentGroups.entries()).map(([dept, deptItems]) => {
            const isExpanded = expandedDepartments.has(dept);
            const deptSelectedCount = deptItems.filter(item => selectedIds.includes(item.id)).length;
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
                          // Only include name attribute when in form-inputs mode
                          {...(renderMode === 'form-inputs' && inputName ? { name: inputName, value: item.id } : {})}
                          checked={selectedIds.includes(item.id)}
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
      </div>
    </>
  );
}