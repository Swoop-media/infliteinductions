// @ts-nocheck
// app/app/layout.tsx
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import NotificationsBell from "./_components/NotificationsBell";
import ReleaseNotesBell from "./_components/ReleaseNotesBell";
import SignOutButton from "./_components/SignOutButton";
import ReportIssueButton from "./_components/ReportIssueButton";
import ContractorsButton from "./_components/ContractorsButton";
import AppSwitcher from "./_components/AppSwitcher";
import { countUnreadReleases } from "@/lib/release-notes/server-helpers";

export const metadata = {
  title: "Training Platform",
  description: "Internal training & assessments",
};

export default async function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServer();

  // Auth snapshot for header (safe on the server)
  let user: any = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch {
    // ignore
  }

  // Check if user has General role or Admin role for Authorisations button
  let showAuthorisationsButton = false;
  if (user) {
    try {
      const hasGeneral = await hasRole("General");
      const hasAdmin = await hasRole("Admin");
      showAuthorisationsButton = hasGeneral || hasAdmin;
    } catch {
      // ignore role check errors
    }
  }

  // Initial unread release-notes count (hides badge if table not yet applied)
  let initialReleaseNotesCount = 0;
  if (user) {
    try {
      const { count } = await countUnreadReleases(supabase, user.id);
      initialReleaseNotesCount = count;
    } catch {
      // ignore — badge simply starts at 0
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2">
          <nav className="flex items-center gap-2.5 text-xs">
            <AppSwitcher />
            <Link href="/app/home" className="whitespace-nowrap hover:text-blue-600">Home</Link>
            <Link href="/app/myprofile" className="whitespace-nowrap hover:text-blue-600">My Profile</Link>
            <Link href="/app/creator" className="whitespace-nowrap hover:text-blue-600">Creator</Link>
            <Link href="/app/train-assess" className="whitespace-nowrap hover:text-blue-600">Train/Assess</Link>
            <Link href="/app/admin" className="whitespace-nowrap hover:text-blue-600">Admin</Link>
            {showAuthorisationsButton && (
              <Link
                href="/app/authorisations"
                className="whitespace-nowrap rounded-md bg-green-600 px-2.5 py-1 text-white hover:bg-green-700"
              >
                Authorisations
              </Link>
            )}
            {showAuthorisationsButton && (
              <Link
                href="/app/operations-notices"
                className="whitespace-nowrap rounded-md bg-orange-500 px-2.5 py-1 text-white hover:bg-orange-600"
              >
                Operations Notices
              </Link>
            )}
          </nav>

          <nav className="flex shrink-0 items-center gap-1.5" aria-label="User actions">
            <ContractorsButton />
            <ReportIssueButton userId={user?.id} />
            <ReleaseNotesBell initialCount={initialReleaseNotesCount} />
            <NotificationsBell />
            {user ? (
              <SignOutButton className="whitespace-nowrap rounded-md border px-2.5 py-1 text-xs" />
            ) : (
              <Link href="/auth/signin" className="whitespace-nowrap rounded-md border px-2.5 py-1 text-xs">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
