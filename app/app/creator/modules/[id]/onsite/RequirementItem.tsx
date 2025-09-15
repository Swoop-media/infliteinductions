// @ts-nocheck

"use client";

import { useState } from "react";

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

function roleToHuman(role: string) {
  if (role === "onsite_trainer" || role === "trainer") return "Trainer";
  if (role === "onsite_assessor" || role === "assessor") return "Assessor";
  return role;
}

function getRoleColor(role: string) {
  if (role === "onsite_trainer" || role === "trainer") return "text-blue-600 bg-blue-50";
  if (role === "onsite_assessor" || role === "assessor") return "text-orange-600 bg-orange-50";
  return "text-gray-600 bg-gray-50";
}

export default function RequirementItem({ 
  requirement: r, 
  moduleId,
  updateRequirementAction,
  deleteRequirementAction 
}: { 
  requirement: Requirement; 
  moduleId: string;
  updateRequirementAction: (formData: FormData) => Promise<void>;
  deleteRequirementAction: (formData: FormData) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <form action={async (formData) => {
          try {
            await updateRequirementAction(formData);
          } catch (error) {
            // Don't catch redirect errors from Next.js server actions
            if (error && typeof error === 'object' && 'digest' in error) {
              // This is a Next.js redirect error, let it bubble up
              throw error;
            }
            console.error("Update failed:", error);
            if (error instanceof Error && error.message.includes("Server Action")) {
              window.location.reload();
              return;
            }
            alert("Failed to update requirement. Please try again.");
          }
        }} className="space-y-4">
          <input type="hidden" name="requirement_id" value={r.id} />
          <input type="hidden" name="module_id" value={moduleId} />
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <input
              name="label"
              defaultValue={r.label || ""}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Field type</label>
              <select name="field_type" defaultValue={r.field_type || "checkbox"} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20">
                <option value="checkbox">Checkbox</option>
                <option value="select">Select</option>
                <option value="text">Text</option>
                <option value="date">Date</option>
                <option value="rating">Rating</option>
                <option value="file">File Upload</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Required?</label>
              <select name="required" defaultValue={r.required ? "yes" : "no"} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Options (JSON array)</label>
            <input
              name="options"
              defaultValue={Array.isArray(r.options) ? JSON.stringify(r.options) : "[]"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
              placeholder='e.g. ["Pass","Fail"] or [1,2,3,4,5]'
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Help text</label>
            <input
              name="help_text"
              defaultValue={r.help_text || ""}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
              placeholder="Optional hint"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors">
              Save Changes
            </button>
            <button 
              type="button" 
              onClick={() => setIsEditing(false)}
              className="rounded-lg bg-gray-500 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow overflow-hidden">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 drag-handle">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
          </svg>
        </div>
        <div className="flex items-start justify-between flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 leading-tight mb-1" title={r.label || ""}>
                {r.label && r.label.length > 12 ? `${r.label.substring(0, 12)}...` : r.label}
              </h4>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getRoleColor(r.role)}`}>
              {roleToHuman(r.role)}
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center">
              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              {r.field_type}
            </span>
            
            {r.required && (
              <span className="inline-flex items-center text-red-600">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Required
              </span>
            )}
          </div>
          
          {Array.isArray(r.options) && r.options.length > 0 && (
            <div className="mt-2 text-xs text-gray-600">
              <span className="font-medium">Options:</span> 
              <code className="ml-1 bg-gray-100 px-1 py-0.5 rounded text-xs">{JSON.stringify(r.options)}</code>
            </div>
          )}
          
          {r.help_text && (
            <div className="mt-2 text-xs text-gray-600">
              <span className="font-medium">Help:</span> {r.help_text}
            </div>
          )}
        </div>
        
        <div className="flex gap-2 ml-3 flex-shrink-0">
          <button
            onClick={() => setIsEditing(true)}
            className="rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
          >
            Edit
          </button>
          <form action={async (formData) => {
            try {
              await deleteRequirementAction(formData);
            } catch (error) {
              // Don't catch redirect errors from Next.js server actions
              if (error && typeof error === 'object' && 'digest' in error) {
                // This is a Next.js redirect error, let it bubble up
                throw error;
              }
              console.error("Delete failed:", error);
              if (error instanceof Error && error.message.includes("Server Action")) {
                window.location.reload();
                return;
              }
              alert("Failed to delete requirement. Please try again.");
            }
          }} className="inline">
            <input type="hidden" name="requirement_id" value={r.id} />
            <input type="hidden" name="module_id" value={moduleId} />
            <button
              type="submit"
              onClick={(e) => {
                if (!confirm("Are you sure you want to delete this requirement?")) {
                  e.preventDefault();
                }
              }}
              className="rounded-md bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
}
