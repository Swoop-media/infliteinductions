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
      const { data: signed } = await supabase
        .storage
        .from("course-files")
        .createSignedUrl(filePath, 60 * 60);
      url = signed?.signedUrl ?? null;
    }

    items.push({
      id: String(row.id),
      title: displayTitle,
      url,
      expires_on: row.expires_on ?? null,
      created_at: row.created_at ?? null,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My documents</h1>
        <Link href="/app/myprofile" className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">
          Back to home
        </Link>
      </div>

      <Flash ok={ok} error={error ?? err} />

      {items.length === 0 ? (
        <div className="rounded-md border bg-white p-4 text-sm text-gray-600">
          You haven’t uploaded any documents yet.
        </div>
      ) : (
        <ul className="divide-y rounded-md border bg-white">
          {items.map((d) => (
            <li key={d.id} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-gray-500">
                  {d.expires_on ? `Expires ${new Date(d.expires_on).toLocaleDateString()}` : "No expiry"}
                  {d.created_at ? ` • Uploaded ${new Date(d.created_at).toLocaleString()}` : ""}
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

      <p className="text-xs text-gray-500">Links are temporary and expire after 1 hour.</p>
    </div>
  );
}
