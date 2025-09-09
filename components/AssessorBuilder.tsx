// @ts-nocheck
"use client";

import * as React from "react";

type FieldType =
  | "short_text"
  | "long_text"
  | "checkbox"
  | "number"
  | "date"
  | "file"
  | "select";

type Field = {
  type: FieldType;
  key: string;
  label: string;
  required?: boolean;
  options?: string[]; // for select
};

export default function AssessorBuilder(props: {
  title: string;
  courseId: string;
  module: "onsite_training" | "onsite_assessment";
  initialSchema: Field[] | null;
  // server action from the page — receives FormData with course_id, module, schema
  action: (fd: FormData) => Promise<void>;
}) {
  const [fields, setFields] = React.useState<Field[]>(
    props.initialSchema && Array.isArray(props.initialSchema) && props.initialSchema.length > 0
      ? props.initialSchema
      : getDefault(props.module)
  );

  const hiddenSchemaRef = React.useRef<HTMLTextAreaElement>(null);
  const [newType, setNewType] = React.useState<FieldType>("short_text");

  const addField = () => {
    const base: Field = {
      type: newType,
      key: uniqueKey(slugify(`field_${newType}`), fields),
      label: labelFor(newType),
      required: false,
    };
    if (newType === "select") base.options = ["Option 1", "Option 2"];
    setFields((f) => [...f, base]);
  };

  const updateField = (idx: number, patch: Partial<Field>) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const removeField = (idx: number) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev];
      const t = idx + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[idx], next[t]] = [next[t], next[idx]];
      return next;
    });
  };

  const beforeSubmit = () => {
    if (hiddenSchemaRef.current) {
      hiddenSchemaRef.current.value = JSON.stringify(fields);
    }
  };

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">{props.title}</h3>
        <div className="flex items-center gap-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as FieldType)}
            className="rounded-md border px-2 py-1 text-sm"
          >
            <option value="short_text">Short text</option>
            <option value="long_text">Long text</option>
            <option value="checkbox">Checkbox</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="file">File upload</option>
            <option value="select">Select (dropdown)</option>
          </select>
          <button
            type="button"
            onClick={addField}
            className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            + Add field
          </button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No fields yet. Add your first field above.
        </div>
      ) : (
        <ul className="space-y-3">
          {fields.map((f, idx) => (
            <li key={idx} className="rounded-md border p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Label</label>
                    <input
                      className="w-full rounded-md border px-2 py-1.5 text-sm"
                      value={f.label}
                      onChange={(e) => updateField(idx, { label: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Key</label>
                    <input
                      className="w-full rounded-md border px-2 py-1.5 text-sm"
                      value={f.key}
                      onChange={(e) => updateField(idx, { key: slugify(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Type</label>
                    <select
                      className="w-full rounded-md border px-2 py-1.5 text-sm"
                      value={f.type}
                      onChange={(e) => {
                        const t = e.target.value as FieldType;
                        const patch: Partial<Field> = { type: t };
                        if (t === "select" && !f.options) patch.options = ["Option 1", "Option 2"];
                        if (t !== "select" && f.options) patch.options = undefined;
                        updateField(idx, patch);
                      }}
                    >
                      <option value="short_text">Short text</option>
                      <option value="long_text">Long text</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="file">File upload</option>
                      <option value="select">Select (dropdown)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => updateField(idx, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, +1)}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeField(idx)}
                    className="rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {f.type === "select" && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium">
                    Options (one per line)
                  </label>
                  <textarea
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    rows={3}
                    value={(f.options || []).join("\n")}
                    onChange={(e) =>
                      updateField(idx, {
                        options: e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Real form posting to the server action */}
      <form
        action={props.action}
        onSubmit={beforeSubmit}
        className="mt-3 flex items-center justify-end gap-2"
      >
        <input type="hidden" name="course_id" value={props.courseId} />
        <input type="hidden" name="module" value={props.module} />
        <textarea ref={hiddenSchemaRef} name="schema" className="hidden" readOnly />
        <button
          type="submit"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          title="Save schema"
        >
          Save
        </button>
      </form>
    </section>
  );
}

function slugify(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function uniqueKey(base: string, existing: Field[]) {
  if (!existing.some((f) => f.key === base)) return base;
  let i = 2;
  while (existing.some((f) => f.key === `${base}_${i}`)) i++;
  return `${base}_${i}`;
}
function labelFor(t: FieldType) {
  switch (t) {
    case "short_text":
      return "Short text";
    case "long_text":
      return "Long text";
    case "checkbox":
      return "Checkbox";
    case "number":
      return "Number";
    case "date":
      return "Date";
    case "file":
      return "File upload";
    case "select":
      return "Select";
  }
}
function getDefault(
  module: "onsite_training" | "onsite_assessment"
): Field[] {
  if (module === "onsite_training") {
    return [
      { type: "long_text", key: "trainer_notes", label: "Trainer notes", required: false },
      { type: "checkbox", key: "ppe_checked", label: "PPE checked", required: true },
      { type: "date", key: "date", label: "Training date", required: true },
    ];
  }
  return [
    { type: "long_text", key: "assessment", label: "Assessment summary", required: true },
    { type: "checkbox", key: "pass", label: "Pass", required: false },
    { type: "date", key: "assessed_on", label: "Assessed on", required: true },
  ];
}
