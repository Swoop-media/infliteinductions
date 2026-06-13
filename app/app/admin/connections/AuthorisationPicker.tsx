"use client";

import Link from "next/link";
import { useState } from "react";
import { deptKey, groupByDept } from "./_deptGroup";

type Item = { id: string; title: string; department: string | null };

export default function AuthorisationPicker({
  authorisations,
  selectedId,
}: {
  authorisations: Item[];
  selectedId: string | null;
}) {
  const groups = groupByDept(authorisations);
  const selectedDept = deptKey(
    authorisations.find((a) => a.id === selectedId)?.department ?? null
  );

  // Auto-open the department that contains the currently selected authorisation.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    selectedId ? { [selectedDept]: true } : {}
  );
  const toggle = (d: string) => setOpen((p) => ({ ...p, [d]: !p[d] }));

  if (authorisations.length === 0) {
    return (
      <div className="rounded-md border px-3 py-3 text-sm text-gray-500">
        No authorisations found.
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] divide-y overflow-y-auto rounded-md border">
      {groups.map(([dept, items]) => {
        const isOpen = open[dept] ?? false;
        return (
          <div key={dept}>
            <button
              type="button"
              onClick={() => toggle(dept)}
              className="flex w-full items-center justify-between bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 hover:bg-gray-100"
            >
              <span>
                {dept} ({items.length})
              </span>
              <span className="text-gray-400">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="divide-y">
                {items.map((a) => {
                  const active = a.id === selectedId;
                  return (
                    <Link
                      key={a.id}
                      href={`/app/admin/connections?tab=connect&auth=${a.id}`}
                      className={[
                        "block px-3 py-2 text-sm",
                        active ? "bg-black text-white" : "hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {a.title}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
