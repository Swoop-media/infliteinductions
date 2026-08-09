// @ts-nocheck
// app/app/admin/tools/document-sweep/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { hasRole } from "@/lib/roles";
import DocumentSweepClient from "./DocumentSweepClient";

export const dynamic = "force-dynamic";

export default async function DocumentSweepPage() {
  noStore();
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools · Stranded upload cleanup</h1>
          <p className="text-sm text-gray-600">
            Finds files in the learner-documents storage bucket that no learner document record points to
            (e.g. a learner closed the tab mid-upload). Nothing is ever deleted automatically — the weekly
            scan only notifies admins, and deletion happens here after you review each finding and confirm.
            Files newer than the safety window are never touched.
          </p>
        </div>
        <Link href="/app/admin" className="rounded-md border px-3 py-1 text-sm">
          Back to Admin
        </Link>
      </div>

      <DocumentSweepClient />
    </div>
  );
}
