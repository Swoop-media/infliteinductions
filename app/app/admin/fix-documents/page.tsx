// @ts-nocheck
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import Link from "next/link";
import DocumentFixer from "./DocumentFixer";

export default async function FixDocumentsPage() {
  // Check if user has Admin role
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) {
    redirect("/app/admin?banner=no_access");
  }

  const supabase = await createSupabaseServer();
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect("/auth/login");
  }

  // Load all documents with missing fields
  const { data: documents, error } = await supabase
    .from("learner_documents")
    .select(`
      *,
      profiles!learner_documents_user_id_fkey(full_name, email)
    `)
    .order("created_at", { ascending: false });

  // Load all courses and modules for reference
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title");

  const { data: modules } = await supabase
    .from("course_modules")
    .select("id, title, course_id");

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Fix Document Records</h1>
        <Link href="/app/admin?tab=documents" className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">
          ← Back to Admin
        </Link>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Document Migration Tool</h3>
        <p className="text-sm text-yellow-800">
          This tool helps fix missing fields in document records that were uploaded but lack proper course/module associations.
        </p>
        <p className="text-sm text-yellow-800 mt-2">
          <strong>Total Documents:</strong> {documents?.length || 0}
        </p>
        <p className="text-sm text-yellow-800">
          <strong>Documents with missing course_title:</strong> {documents?.filter(d => !d.course_title).length || 0}
        </p>
        <p className="text-sm text-yellow-800">
          <strong>Documents with missing module_title:</strong> {documents?.filter(d => !d.module_title).length || 0}
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-md border bg-red-50 border-red-200 text-red-800">
          Error loading documents: {error.message}
        </div>
      )}

      <DocumentFixer 
        documents={documents || []}
        courses={courses || []}
        modules={modules || []}
      />
    </div>
  );
}