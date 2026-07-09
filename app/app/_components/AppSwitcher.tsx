// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

const APPS = [
  {
    name: "SafeFLITE",
    logo: "/safeflite-logo.png",
    url: "https://safeflite.inflite.nz",
  },
  {
    name: "Operations",
    logo: "/operations-logo.png",
    url: "https://ops.inflite.nz",
  },
];

export default function AppSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openApp = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 hover:bg-gray-50"
        title="Switch app"
        aria-label="Open app switcher"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <img
          src="/induction-logo.png"
          alt="TRAINING"
          className="h-5 w-auto dark:invert dark:brightness-150"
        />
        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border bg-white py-1 shadow-lg"
        >
          <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Open another app
          </div>
          {APPS.map((app) => (
            <button
              key={app.name}
              type="button"
              role="menuitem"
              onClick={() => openApp(app.url)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50"
            >
              <img
                src={app.logo}
                alt={app.name}
                className="h-5 w-auto dark:invert dark:brightness-150"
              />
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
