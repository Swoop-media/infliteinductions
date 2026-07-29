"use client";

import { useEffect, useState } from "react";

/**
 * Responsive shell for the course module sidebar.
 * - Desktop (md+): the sidebar is the usual fixed-width left column.
 * - Mobile: collapsed by default; a floating "Modules" button turns the same
 *   container into a slide-over drawer. Tapping a module link or the backdrop
 *   closes it.
 *
 * The sidebar content is server-rendered and mounted exactly ONCE — the same
 * container is restyled between column and drawer, so client components inside
 * never get duplicated.
 */
export default function CourseSidebarShell({
  children,
  summary,
  currentModuleTitle,
}: {
  children: React.ReactNode;
  summary: string;
  currentModuleTitle?: string;
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Mobile backdrop (below drawer, above app UI incl. peer-review panel) */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-[69] bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Single sidebar container: hidden on mobile unless open (drawer), always a static column on md+ */}
      <div
        className={`${
          open
            ? "flex fixed inset-y-0 left-0 z-[70] w-72 max-w-[85%] shadow-xl"
            : "hidden"
        } bg-gray-50 flex-col border-r md:flex md:static md:inset-auto md:z-auto md:w-56 md:max-w-none md:shadow-none`}
      >
        {/* Mobile-only drawer header with close button */}
        <div className="md:hidden flex items-center justify-between px-3 py-2 border-b bg-white">
          <span className="text-sm font-medium text-gray-700">Course modules</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
            aria-label="Close module list"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto flex flex-col min-h-0"
          onClick={(e) => {
            // Close the drawer when a module link is tapped (no-op on desktop)
            const target = e.target as HTMLElement;
            if (target.closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      </div>

      {/* Mobile: floating toggle button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="md:hidden fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full bg-blue-600 text-white shadow-lg px-4 py-2.5 text-sm font-medium active:bg-blue-700"
          aria-label="Open module list"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="flex flex-col items-start leading-tight text-left">
            <span>Modules · {summary}</span>
            {currentModuleTitle && (
              <span className="text-[11px] font-normal text-blue-100 max-w-[180px] truncate">
                {currentModuleTitle}
              </span>
            )}
          </span>
        </button>
      )}
    </>
  );
}
