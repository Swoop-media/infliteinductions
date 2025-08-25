
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
      <li className="rounded-md border p-3 text-sm bg-gray-50">
        <form action={updateRequirementAction} className="space-y-3">
          <input type="hidden" name="requirement_id" value={r.id} />
          <input type="hidden" name="module_id" value={moduleId} />
          
          <div className="grid gap-2">
            <label className="text-xs font-medium">Label</label>
            <input
              name="label"
              defaultValue={r.label || ""}
              className="w-full rounded border px-2 py-1 text-sm"
              required
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium">Field type</label>
            <select name="field_type" defaultValue={r.field_type || "checkbox"} className="rounded border px-2 py-1 text-sm">
              <option value="checkbox">Checkbox</option>
              <option value="select">Select</option>
              <option value="text">Text</option>
              <option value="date">Date</option>
              <option value="rating">Rating</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium">Options (JSON array)</label>
            <input
              name="options"
              defaultValue={Array.isArray(r.options) ? JSON.stringify(r.options) : "[]"}
              className="w-full rounded border px-2 py-1 text-sm"
              placeholder='e.g. ["Pass","Fail"] or [1,2,3,4,5]'
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium">Required?</label>
            <select name="required" defaultValue={r.required ? "yes" : "no"} className="rounded border px-2 py-1 text-sm">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium">Order</label>
            <input
              name="order_index"
              type="number"
              defaultValue={r.order_index || ""}
              className="w-20 rounded border px-2 py-1 text-sm"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium">Help text</label>
            <input
              name="help_text"
              defaultValue={r.help_text || ""}
              className="w-full rounded border px-2 py-1 text-sm"
              placeholder="Optional hint"
            />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="rounded bg-green-600 px-3 py-1 text-xs text-white">
              Save
            </button>
            <button 
              type="button" 
              onClick={() => setIsEditing(false)}
              className="rounded bg-gray-500 px-3 py-1 text-xs text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-md border p-2 text-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{r.label}</div>
          <div className="text-xs text-gray-500">
            {roleToHuman(r.role)} • {r.field_type}
            {typeof r.order_index === "number" ? ` • Order ${r.order_index}` : ""}
            {r.required ? " • Required" : ""}
          </div>
          {Array.isArray(r.options) && r.options.length > 0 && (
            <div className="text-xs text-gray-500">
              Options: <code>{JSON.stringify(r.options)}</code>
            </div>
          )}
          {r.help_text && (
            <div className="text-xs text-gray-500">Help: {r.help_text}</div>
          )}
        </div>
        <div className="flex gap-1 ml-2">
          <button
            onClick={() => setIsEditing(true)}
            className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
          >
            Edit
          </button>
          <form action={deleteRequirementAction} className="inline">
            <input type="hidden" name="requirement_id" value={r.id} />
            <input type="hidden" name="module_id" value={moduleId} />
            <button
              type="submit"
              onClick={(e) => {
                if (!confirm("Are you sure you want to delete this requirement?")) {
                  e.preventDefault();
                }
              }}
              className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
            >
              Delete
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
