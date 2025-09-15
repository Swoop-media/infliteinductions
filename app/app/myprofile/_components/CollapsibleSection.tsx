"use client";

import { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultCollapsed?: boolean;
  pillTone?: "default" | "green" | "blue" | "gray";
  children: React.ReactNode;
}

function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "blue" | "gray";
}) {
  const tones: Record<string, string> = {
    default: "bg-gray-100 text-gray-800",
    green: "bg-green-100 text-green-800",
    blue: "bg-blue-100 text-blue-800",
    gray: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export default function CollapsibleSection({
  title,
  count,
  defaultCollapsed = false,
  pillTone = "default",
  children,
}: CollapsibleSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <section className="space-y-3 rounded-xl border bg-white p-4">
      <div 
        className="flex items-center justify-between cursor-pointer select-none hover:bg-gray-50 -m-2 p-2 rounded-lg"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="text-gray-400 text-sm">
            {isCollapsed ? "▼" : "▲"}
          </span>
        </div>
        <Pill tone={pillTone}>{count}</Pill>
      </div>

      {!isCollapsed && (
        <div className="space-y-3">
          {children}
        </div>
      )}
    </section>
  );
}