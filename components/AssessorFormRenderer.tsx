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

export type AssessorFormRendererProps = {
  schema: Field[];
  enrolmentId: string;
  module: "onsite_training" | "onsite_assessment";
  onSubmitToServer: (formData: FormData) => Promise<void>;
};

export default function AssessorFormRenderer({
  schema,
  enrolmentId,
  module,
  onSubmitToServer,
}: AssessorFormRendererProps) {
  const [values, setValues] = React.useState<Record<string, any>>({});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const hiddenAnswersRef = React.useRef<HTMLTextAreaElement>(null);

  const setVal = (key: string, v: any) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  // Only non-file fields go into answers_json; files are sent as <input type="file" name={key}>
  const beforeSubmit = () => {
    setErr(null);
    const answers: Record<string, any> = {};
    for (const f of schema) {
      if (f.type === "file") continue; // files handled server-side
      answers[f.key] = values[f.key] ?? null;
    }
    if (hiddenAnswersRef.current) {
      hiddenAnswersRef.current.value = JSON.stringify(answers);
    }
    return true;
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      beforeSubmit();
      const fd = new FormData(e.currentTarget);
      await onSubmitToServer(fd);
    } catch (e: any) {
      setErr(e?.message || "Failed to submit.");
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
      encType="multipart/form-data"
    >
      {schema.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No fields configured for this form yet.
        </div>
      ) : (
        <div className="space-y-4">
          {schema.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="block text-sm font-medium">
                {f.label} {f.required ? <span className="text-red-600">*</span> : null}
              </label>

              {f.type === "short_text" && (
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required={!!f.required}
                  onChange={(e) => setVal(f.key, e.target.value)}
                />
              )}

              {f.type === "long_text" && (
                <textarea
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  rows={4}
                  required={!!f.required}
                  onChange={(e) => setVal(f.key, e.target.value)}
                />
              )}

              {f.type === "checkbox" && (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    onChange={(e) => setVal(f.key, e.target.checked)}
                  />
                  <span>Yes</span>
                </label>
              )}

              {f.type === "number" && (
                <input
                  type="number"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required={!!f.required}
                  onChange={(e) => setVal(f.key, Number(e.target.value))}
                />
              )}

              {f.type === "date" && (
                <input
                  type="date"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required={!!f.required}
                  onChange={(e) => setVal(f.key, e.target.value)}
                />
              )}

              {f.type === "select" && (
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required={!!f.required}
                  onChange={(e) => setVal(f.key, e.target.value)}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {(f.options || []).map((opt, i) => (
                    <option key={i} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}

              {f.type === "file" && (
                <input
                  type="file"
                  name={f.key} // important: server action will read from FormData
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required={!!f.required}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hidden fields for server action */}
      <input type="hidden" name="enrolment_id" value={enrolmentId} />
      <input type="hidden" name="module" value={module} />
      <textarea ref={hiddenAnswersRef} name="answers_json" className="hidden" readOnly />

      {err ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={busy || schema.length === 0}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
      </div>
    </form>
  );
}
