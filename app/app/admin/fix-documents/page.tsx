// @ts-nocheck
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import Link from "next/link";
import DocumentFixer from "./DocumentFixer";

const PAGE_SIZE = 100;

// Active documents are those not marked 'replaced' (status may be null)
const ACTIVE_FILTER = "status.is.null,status.neq.replaced";

export default async function FixDocumentsPage({ searchParams }) {
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

  const params = (await searchParams) || {};
  const view = params.view === "archived" ? "archived" : "active";
  const requestedPage = Math.max(1, parseInt(params.page, 10) || 1);

  // Server-side counts (no rows shipped: head-only count queries)
  const [activeCountRes, archivedCountRes, missingCourseRes, missingModuleRes] =
    await Promise.all([
      supabase
        .from("learner_documents")
        .select("id", { count: "exact", head: true })
        .or(ACTIVE_FILTER),
      supabase
        .from("learner_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "replaced"),
      supabase
        .from("learner_documents")
        .select("id", { count: "exact", head: true })
        .or(ACTIVE_FILTER)
        .is("course_title", null),
      supabase
        .from("learner_documents")
        .select("id", { count: "exact", head: true })
        .or(ACTIVE_FILTER)
        .is("module_title", null),
    ]);

  const activeCount = activeCountRes.count ?? 0;
  const archivedCount = archivedCountRes.count ?? 0;
  const missingCourseCount = missingCourseRes.count ?? 0;
  const missingModuleCount = missingModuleRes.count ?? 0;

  const totalInView = view === "archived" ? archivedCount : activeCount;
  const totalPages = Math.max(1, Math.ceil(totalInView / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Load only the current view's page of documents
  let docsQuery = supabase
    .from("learner_documents")
    .select("*")
    .order("created_at", { ascending: false })
    .range(from, to);
  docsQuery =
    view === "archived"
      ? docsQuery.eq("status", "replaced")
      : docsQuery.or(ACTIVE_FILTER);

  const { data: documents, error } = await docsQuery;

  // Load profiles separately to avoid foreign key issues
  const userIds = documents ? [...new Set(documents.map(d => d.user_id))] : [];
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
    : { data: [] };

  // Map profiles to documents
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  const documentsWithProfiles = (documents || []).map(doc => ({
    ...doc,
    profiles: profileMap.get(doc.user_id)
  }));

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
          <strong>Active Documents:</strong> {activeCount} ({archivedCount} archived)
        </p>
        <p className="text-sm text-yellow-800">
          <strong>Active documents with missing course_title:</strong> {missingCourseCount}
        </p>
        <p className="text-sm text-yellow-800">
          <strong>Active documents with missing module_title:</strong> {missingModuleCount}
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-md border bg-red-50 border-red-200 text-red-800">
          Error loading documents: {error.message}
        </div>
      )}

      <DocumentFixer
        documents={documentsWithProfiles || []}
        courses={courses || []}
        modules={modules || []}
        view={view}
        page={page}
        totalPages={totalPages}
        totalInView={totalInView}
        archivedCount={archivedCount}
      />
    </div>
  );
}
