// @ts-nocheck
// app/app/layout.tsx
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import NotificationsBell from "./_components/NotificationsBell";
import SignOutButton from "./_components/SignOutButton";
import ReportIssueButton from "./_components/ReportIssueButton"; // Assuming ReportIssueButton is in this path
import ContractorsButton from "./_components/ContractorsButton";

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

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/app/home">Home</Link>
            <Link href="/app/myprofile">My Profile</Link>
            <Link href="/app/creator">Creator</Link>
            <Link href="/app/train-assess">Train/Assess</Link>
            <Link href="/app/admin">Admin</Link>
            {showAuthorisationsButton && (
              <Link 
                href="/app/authorisations" 
                className="rounded-md bg-green-600 px-3 py-1 text-white hover:bg-green-700"
              >
                Authorisations
              </Link>
            )}
          </nav>

          <nav className="flex items-center gap-2">
            <ReportIssueButton userId={user?.id} />
            <ContractorsButton />
            <NotificationsBell />
            {user ? (
              <SignOutButton className="rounded-md border px-3 py-1 text-sm" />
            ) : (
              <Link href="/auth/signin" className="rounded-md border px-3 py-1 text-sm">
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