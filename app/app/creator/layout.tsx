import { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasRole } from "@/lib/roles";
import { cn } from "@/lib/utils"; // if you don't have this, replace cn(...) with a plain template string join

export default async function CreatorLayout({ children }: { children: ReactNode }) {
  // Server-side role guard: only Course creators, Senior management, or Admin
  const canAccess =
    (await hasRole("Course creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));

  if (!canAccess) {
    redirect("/app?error=not_authorised");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Creator</h1>
          <p className="text-sm text-muted-foreground">
            Build and manage Courses and Authorisations.
          </p>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/app/creator?tab=courses"
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-100",
              "border border-gray-200"
            )}
          >
            Courses
          </Link>
          <Link
            href="/app/creator?tab=authorisations"
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-100",
              "border border-gray-200"
            )}
          >
            Authorisations
          </Link>
        </nav>
      </header>

      <main>{children}</main>
    </div>
  );
}


