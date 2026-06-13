"use client";

import { useMemo, useState } from "react";
import { groupByDept } from "./_deptGroup";

type Item = { id: string; title: string; department: string | null };

export default function AddConnectionsForm({
  authId,
  candidates,
}: {
  authId: string;
  candidates: Item[];
}) {
  const groups = useMemo(() => groupByDept(candidates), [candidates]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggleGroup = (d: string) => setOpen((p) => ({ ...p, [d]: !p[d] }));

  const toggleItem = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAllInGroup = (items: Item[]) =>
    setChecked((prev) => {
      const next = new Set(prev);
      const all = items.every((i) => next.has(i.id));
      items.forEach((i) => (all ? next.delete(i.id) : next.add(i.id)));
      return next;
    });

  return (
    <form action="/app/admin/connections/add" method="post" className="space-y-3">
      <input type="hidden" name="auth" value={authId} />
      {/* Selected IDs are submitted from state, so they post even when their
          department group is collapsed (collapsed inputs are not in the DOM). */}
      {Array.from(checked).map((id) => (
        <input key={id} type="hidden" name="target" value={id} />
      ))}
      <p className="text-xs text-gray-500">
        Open a department, tick the authorisations to connect, then add them all at once.
      </p>
      <div className="max-h-[40vh] divide-y overflow-y-auto rounded-md border">
        {groups.map(([dept, items]) => {
          const isOpen = open[dept] ?? false;
          const all = items.every((i) => checked.has(i.id));
          const some = items.some((i) => checked.has(i.id));
          const selectedCount = items.filter((i) => checked.has(i.id)).length;
          return (
            <div key={dept}>
              <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(dept)}
                  className="flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                >
                  <span className="text-gray-400">{isOpen ? "▾" : "▸"}</span>
                  <span>
                    {dept} ({items.length})
                    {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
                  </span>
                </button>
                <label className="flex shrink-0 items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={all}
                    ref={(el) => {
                      if (el) el.indeterminate = !all && some;
                    }}
                    onChange={() => toggleAllInGroup(items)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  Select all
                </label>
              </div>
              {isOpen && (
                <div className="divide-y">
                  {items.map((a) => (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(a.id)}
                        onChange={() => toggleItem(a.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span>{a.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        disabled={checked.size === 0}
        className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
      >
        Add selected connections{checked.size ? ` (${checked.size})` : ""}
      </button>
    </form>
  );
}
