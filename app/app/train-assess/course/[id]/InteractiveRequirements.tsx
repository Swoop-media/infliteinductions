// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

/**
 * Changes:
 * - Removed initial `useEffect` fetch; data is passed from the server via props.
 * - Added debounced local save plus a hard 60s flush (configurable).
 * - Preserves existing POST endpoints (/api/requirement-responses, /api/assignment/progress).
 * - Keeps UI/logic intact while cutting an extra round-trip on mount.
 */

interface Requirement {
  id: string;
  module_id: string;
  role: string;
  label: string | null;
  field_type: string | null;
  options: any;
  is_required?: boolean;
}

type Props = {
  moduleId: string;
  assignmentId: string;
  sessionType: "training" | "assessment" | string;
  role?: string;
  requirementDefinitions: Requirement[];
  initialResponses: Record<string, any>;
  initialCompleted?: boolean;
  autosaveDebounceMs?: number;  // default 1200ms
  autosaveHardFlushMs?: number; // default 60000ms
};

export default function InteractiveRequirements(props: Props) {
  const {
    moduleId,
    assignmentId,
    sessionType,
    role,
    requirementDefinitions,
    initialResponses,
    initialCompleted = false,
    autosaveDebounceMs = 1200,
    autosaveHardFlushMs = 60000,
  } = props;

  const [responses, setResponses] = useState<Record<string, any>>(() => {
    const start: Record<string, any> = {};
    for (const r of requirementDefinitions) {
      start[r.id] = initialResponses[r.id] ?? null;
    }
    return start;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // kept for compatibility
  const [isCompleted, setIsCompleted] = useState(Boolean(initialCompleted));
  const [touchedSinceSave, setTouchedSinceSave] = useState(false);

  const debouncer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSave = useRef<Promise<any> | null>(null);

  const allRequiredFieldsCompleted = useMemo(() => {
    return requirementDefinitions.every((r) => {
      if (!r.is_required) return true;
      const v = responses[r.id];
      if (r.field_type === "pass_fail") return v === "pass" || v === "fail";
      if (r.field_type === "boolean") return v === true || v === false;
      if (r.field_type === "text" || r.field_type === "select") return v != null && String(v).trim().length > 0;
      return v != null;
    });
  }, [requirementDefinitions, responses]);

  useEffect(() => {
    // Hard flush every autosaveHardFlushMs if there are changes
    hardTimer.current = setInterval(() => {
      if (touchedSinceSave) {
        void doSave(false);
      }
    }, autosaveHardFlushMs);
    return () => {
      if (hardTimer.current) clearInterval(hardTimer.current);
    };
  }, [touchedSinceSave, autosaveHardFlushMs]);

  useEffect(() => {
    // Flush on unmount / route change
    return () => {
      if (debouncer.current) clearTimeout(debouncer.current);
      if (touchedSinceSave) {
        // Best-effort sync; we can't await here
        navigator.sendBeacon?.("/api/requirement-responses", new Blob([JSON.stringify({
          assignmentId,
          moduleId,
          responses,
        })], { type: "application/json" }));
      }
    };
  }, [touchedSinceSave, responses, assignmentId, moduleId]);

  function queueSave() {
    setTouchedSinceSave(true);
    if (debouncer.current) clearTimeout(debouncer.current);
    debouncer.current = setTimeout(() => {
      void doSave(false);
    }, autosaveDebounceMs);
  }

  async function doSave(showBusy = true) {
    if (pendingSave.current) return; // collapse overlapping saves
    try {
      if (showBusy) setIsSaving(true);
      pendingSave.current = fetch("/api/requirement-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          moduleId,
          responses,
        }),
      });
      const res = await pendingSave.current;
      if (!res.ok) {
        console.error("Save failed", await res.text());
        return;
      }
      setTouchedSinceSave(false);
    } finally {
      pendingSave.current = null;
      if (showBusy) setIsSaving(false);
    }
  }

  async function handleManualSave() {
    if (debouncer.current) clearTimeout(debouncer.current);
    await doSave(true);
  }

  async function handleCompleteModule() {
    // Ensure latest edits are saved first
    if (touchedSinceSave) await doSave(true);

    setIsLoading(true);
    try {
      const progressResponse = await fetch("/api/assignment/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          moduleId,
          completed: true,
        }),
      });
      if (progressResponse.ok) {
        setIsCompleted(true);
      } else {
        console.error("Complete failed", await progressResponse.text());
      }
    } finally {
      setIsLoading(false);
    }
  }

  // Render helper for fields (kept simple; reuse your real renderers if you have them)
  function renderField(r: Requirement) {
    const value = responses[r.id];
    const onChange = (v: any) => {
      setResponses((prev) => ({ ...prev, [r.id]: v }));
      queueSave();
    };

    switch (r.field_type) {
      case "pass_fail":
        return (
          <div className="flex gap-2">
            <Button
              type="button"
              variant={value === "pass" ? "default" : "outline"}
              onClick={() => onChange("pass")}
              size="sm"
            >
              Pass
            </Button>
            <Button
              type="button"
              variant={value === "fail" ? "default" : "outline"}
              onClick={() => onChange("fail")}
              size="sm"
            >
              Fail
            </Button>
          </div>
        );
      case "boolean":
        return (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span className="text-sm">Checked</span>
          </div>
        );
      case "select":
        return (
          <select
            className="border rounded px-2 py-1 text-sm"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="" disabled>Select…</option>
            {(Array.isArray(r.options) ? r.options : []).map((opt: any) => (
              <option key={String(opt?.value ?? opt)} value={String(opt?.value ?? opt)}>
                {String(opt?.label ?? opt)}
              </option>
            ))}
          </select>
        );
      case "text":
      default:
        return (
          <input
            type="text"
            className="border rounded px-2 py-1 text-sm w-full"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => queueSave()}
          />
        );
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge variant={isCompleted ? "default" : "secondary"}>
            {isCompleted ? "Completed" : "In progress"}
          </Badge>
          {!allRequiredFieldsCompleted && (
            <span className="text-xs text-muted-foreground">(Some required fields incomplete)</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleManualSave}
            size="sm"
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save progress"}
          </Button>
          <Button
            onClick={handleCompleteModule}
            size="sm"
            disabled={isLoading || !allRequiredFieldsCompleted}
          >
            {isLoading ? "Completing…" : "Complete module"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {requirementDefinitions.map((r) => (
          <div key={r.id} className="p-3 rounded border">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-sm">{r.label ?? "Requirement"}</div>
                <div className="text-xs text-muted-foreground">
                  {r.field_type}{r.is_required ? " • required" : ""}
                </div>
              </div>
              <div>{renderField(r)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
