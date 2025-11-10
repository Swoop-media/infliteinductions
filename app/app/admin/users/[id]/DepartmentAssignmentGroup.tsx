'use client';

import { useState } from 'react';
import DepartmentAssignmentBase from '../DepartmentAssignmentBase';

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
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(() => {
    const validItemIds = new Set(items.map(item => item.id));
    return selectedIds.filter(id => validItemIds.has(id));
  });

  const handleSelectionChange = (newSelectedIds: string[]) => {
    setLocalSelectedIds(newSelectedIds);
    onSelectionChange?.(newSelectedIds);
  };

  const getSelectedCount = () => localSelectedIds.length;
  const getTotalCount = () => items.length;

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
        
        {/* Use the base component with hidden inputs mode for form submission */}
        <DepartmentAssignmentBase
          items={items}
          selectedIds={localSelectedIds}
          onSelectionChange={handleSelectionChange}
          inputName={inputName}
          renderMode="hidden-inputs"
        />
        
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