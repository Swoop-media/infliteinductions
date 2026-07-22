// @ts-nocheck
// app/app/admin/tools/bulk-assign-authorisation/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { hasRole } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase/admin";
import BulkAssignClient from "./BulkAssignClient";

export const dynamic = "force-dynamic";

export default async function BulkAssignAuthorisationPage() {
  noStore();
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  const admin = supabaseAdmin();
  const { data: authorisations } = await admin
    .from("authorisations")
    .select("id, title")
    .order("title", { ascending: true });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools · Bulk assign authorisation</h1>
          <p className="text-sm text-gray-600">
            Assign an authorisation to every active user. Users who already completed it (or are part-way through)
            will have their progress reset for a forced retake — their past completion is kept in training history.
          </p>
        </div>
        <Link href="/app/admin" className="rounded-md border px-3 py-1 text-sm">
          Back to Admin
        </Link>
      </div>

      <BulkAssignClient authorisations={authorisations || []} />
    </div>
  );
}
