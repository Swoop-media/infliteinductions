
"use client";

import { useState } from "react";
import RequirementItem from "./RequirementItem";

type Requirement = {
  id: string;
  module_id: string;
  role: "onsite_trainer" | "onsite_assessor" | "trainer" | "assessor";
  label: string | null;
  field_type: string | null;
  options: any;
  required: boolean | null;
  order_index: number | null;
  help_text: string | null;
  created_at: string | null;
};

export default function SortableRequirements({ 
  requirements, 
  moduleId,
  updateRequirementAction,
  deleteRequirementAction,
  reorderRequirementsAction
}: { 
  requirements: Requirement[]; 
  moduleId: string;
  updateRequirementAction: (formData: FormData) => Promise<void>;
  deleteRequirementAction: (formData: FormData) => Promise<void>;
  reorderRequirementsAction: (formData: FormData) => Promise<void>;
}) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [localRequirements, setLocalRequirements] = useState(requirements);

  const handleDragStart = (e: React.DragEvent, requirementId: string) => {
    setDraggedItem(requirementId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, requirementId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverItem(requirementId);
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem === targetId) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    const draggedIndex = localRequirements.findIndex(r => r.id === draggedItem);
    const targetIndex = localRequirements.findIndex(r => r.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder the items
    const newRequirements = [...localRequirements];
    const [draggedRequirement] = newRequirements.splice(draggedIndex, 1);
    newRequirements.splice(targetIndex, 0, draggedRequirement);
    
    setLocalRequirements(newRequirements);
    setDraggedItem(null);
    setDragOverItem(null);

    // Save the new order
    const formData = new FormData();
    formData.append("module_id", moduleId);
    formData.append("reordered_ids", newRequirements.map(r => r.id).join(","));
    
    try {
      await reorderRequirementsAction(formData);
    } catch (error) {
      // Revert on error
      setLocalRequirements(requirements);
      console.error("Failed to reorder requirements:", error);
    }
  };

  if (localRequirements.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-lg font-medium mb-2">No training requirements yet</p>
        <p className="text-sm">Add requirements using the form on the left to create your onsite training checklist</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {localRequirements.map((requirement) => (
        <div
          key={requirement.id}
          draggable
          onDragStart={(e) => handleDragStart(e, requirement.id)}
          onDragOver={(e) => handleDragOver(e, requirement.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, requirement.id)}
          className={`transition-all duration-200 ${
            draggedItem === requirement.id ? "opacity-50 scale-95" : ""
          } ${
            dragOverItem === requirement.id ? "border-t-4 border-blue-500 pt-2" : ""
          }`}
        >
          <RequirementItem 
            requirement={requirement} 
            moduleId={moduleId}
            updateRequirementAction={updateRequirementAction}
            deleteRequirementAction={deleteRequirementAction}
          />
        </div>
      ))}
      <div className="text-xs text-gray-500 text-center pt-2">
        <svg className="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
        </svg>
        Drag requirements to reorder them
      </div>
    </div>
  );
}
