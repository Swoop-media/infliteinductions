// @ts-nocheck
// app/app/myprofile/documents/page.tsx
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function Flash({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (ok) {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
        {ok === "saved" ? "Saved." : "Done."}
      </div>
    );
  }
  return null;
}

async function loadMyDocs() {
  "use server";
  noStore();

  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { items: [], error: "Not signed in" };

  // Select everything to avoid “column does not exist” errors across environments
  const { data, error } = await supabase
    .from("learner_documents")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { items: [], error: error.message };

  const items: Array<{
    id: string;
    title: string;
    url: string | null;
    expires_on: string | null;
    created_at: string | null;
  }> = [];

  for (const row of (data ?? []) as any[]) {
    // Try common field names for display; fall back to filename from file_path
    const rawTitle =
      row.title ??
      row.filename ??
      row.name ??
      row.display_name ??
      null;

    const filePath: string | null =
      typeof row.file_path === "string"
        ? row.file_path
        : typeof row.file === "string"
        ? row.file
        : typeof row.path === "string"
        ? row.path
        : null;

    const derivedFromPath =
      filePath?.split("/").pop() || "Document";

    const displayTitle = String(rawTitle || derivedFromPath);

    // Create 1-hour signed URL if we have a path
    let url: string | null = null;
    if (filePath) {
      // Determine which bucket to use based on the file path
      // Files starting with UUID pattern are in learner-documents bucket
      // Files starting with 'learner-documents/' are in course-files bucket
      let bucketName = 'course-files'; // Default to course-files
      
      // Check if path starts with UUID pattern (user ID)
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//.test(filePath)) {
        bucketName = 'learner-documents';
      }
      // Also check for paths that don't start with 'learner-documents/' or other known prefixes
      // These might also be in learner-documents bucket
      else if (!filePath.startsWith('learner-documents/') && 
               !filePath.startsWith('module-') && 
               !filePath.startsWith('course-') &&
               !filePath.startsWith('test-')) {
        // For backward compatibility, check if it might be a learner document
        bucketName = 'learner-documents';
      }
      
      const { data: signed, error } = await supabase
        .storage
        .from(bucketName)
        .createSignedUrl(filePath, 60 * 60);
        
      if (error && bucketName === 'learner-documents') {
        // If error with learner-documents, try course-files as fallback
        const { data: fallbackSigned } = await supabase
          .storage
          .from('course-files')
          .createSignedUrl(filePath, 60 * 60);
        url = fallbackSigned?.signedUrl ?? null;
      } else {
        url = signed?.signedUrl ?? null;
      }
    }

    items.push({
      id: String(row.id),
      title: displayTitle,
      url,
      expires_on: row.expires_on ?? null,
      created_at: row.created_at ?? null,
      course_title: row.course_title,
      module_title: row.module_title,
      status: row.status ?? null,
    });
  }

  return { items, error: null };
}

interface MyDocumentsSearchParams extends Record<string, string | string[] | undefined> {
  ok?: string | string[] | undefined;
  error?: string | string[] | undefined;
}

export default async function MyDocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<MyDocumentsSearchParams>;
}) {
  const sp: MyDocumentsSearchParams = (await (searchParams ?? Promise.resolve({}))) || {};
  const ok = (Array.isArray(sp?.ok) ? sp?.ok[0] : sp?.ok) ?? null;
  const err =
    (Array.isArray(sp?.error) ? sp?.error[0] : sp?.error) ?? null;

  const { items, error } = await loadMyDocs();

  // Split into current documents and old (replaced or expired) documents
  const now = new Date();
  const currentItems = items.filter(
    (d) =>
      d.status !== "replaced" &&
      (!d.expires_on || new Date(d.expires_on) >= now)
  );
  const oldItems = items.filter(
    (d) =>
      d.status === "replaced" ||
      (d.expires_on && new Date(d.expires_on) < now)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My documents</h1>
        <Link href="/app/myprofile" className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">
          Back to home
        </Link>
      </div>

      <Flash ok={ok} error={error ?? err} />

      {currentItems.length === 0 ? (
        <div className="rounded-md border bg-white p-4 text-sm text-gray-600">
          {oldItems.length > 0
            ? "You have no current documents. Your older documents are listed below."
            : "You haven’t uploaded any documents yet."}
        </div>
      ) : (
        <ul className="divide-y rounded-md border bg-white">
          {currentItems.map((d) => (
            <li key={d.id} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-gray-500">
                  {d.course_title ? `${d.course_title}` : ""}
                  {d.module_title ? ` - ${d.module_title}` : ""}
                </div>
                <div className="text-xs text-gray-500">
                  {d.expires_on ? `Expires ${new Date(d.expires_on).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}` : "No expiry"}
                  {d.created_at ? ` • Uploaded ${new Date(d.created_at).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ""}
                </div>
              </div>
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
                >
                  View
                </a>
              ) : (
                <span className="text-xs text-gray-500">No file</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {oldItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Old documents ({oldItems.length})</h2>
          <p className="text-xs text-gray-500">
            Documents that have expired or were replaced by a newer upload. They are kept for your records.
          </p>
          <ul className="divide-y rounded-md border bg-white">
            {oldItems.map((d) => (
              <li key={d.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{d.title}</span>
                    {d.status === "replaced" ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Replaced
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Expired
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {d.course_title ? `${d.course_title}` : ""}
                    {d.module_title ? ` - ${d.module_title}` : ""}
                  </div>
                  <div className="text-xs text-gray-500">
                    {d.expires_on ? `Expires ${new Date(d.expires_on).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}` : "No expiry"}
                    {d.created_at ? ` • Uploaded ${new Date(d.created_at).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ""}
                  </div>
                </div>
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-xs text-gray-500">No file</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-500">Links are temporary and expire after 1 hour.</p>
    </div>
  );
}
