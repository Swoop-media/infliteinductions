// app/app/admin/tools/signed-url-cleanup/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

type FileBlock = {
  id: string;
  module_id: string;
  data: any;
  created_at: string | null;
};

function Banner({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (ok) {
    const msg =
      ok === "dry_run" ? "Loaded a sample of affected blocks." :
      ok?.startsWith("cleaned_")
        ? `Cleanup complete. ${ok.replace("cleaned_", "")} blocks updated.`
        : "Done.";
    return (
      <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
        {msg}
      </div>
    );
  }
  return null;
}

async function loadData() {
  "use server";
  noStore();

  const supabase = await createSupabaseServer();
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  // Count affected rows (kind=file AND data.signed_url present and not null)
  const { count: affectedCount } = await supabase
    .from("module_content_blocks")
    .select("id", { count: "exact", head: true })
    .eq("kind", "file")
    .not("data->>signed_url", "is", null);

  // Sample a few to show what would change
  const { data: sample = [] } = await supabase
    .from("module_content_blocks")
    .select("id, module_id, data, created_at")
    .eq("kind", "file")
    .not("data->>signed_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(25);

  return {
    affectedCount: affectedCount ?? 0,
    sample: (sample as FileBlock[]) ?? [],
  };
}

// --- Actions ---------------------------------------------------------------

async function dryRunAction() {
  "use server";
  redirect("/app/admin/tools/signed-url-cleanup?ok=dry_run");
}

async function runCleanupAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  // Fetch IDs + data for all affected blocks in manageable batches
  // (If you expect huge volumes, we can paginate. This is fine for hundreds/thousands.)
  const { data: rows = [], error } = await supabase
    .from("module_content_blocks")
    .select("id, data")
    .eq("kind", "file")
    .not("data->>signed_url", "is", null);

  if (error) {
    redirect(`/app/admin/tools/signed-url-cleanup?error=${encodeURIComponent(error.message)}`);
  }

  let updated = 0;

  // Update in small chunks to be gentle
  const chunkSize = 200;
  if (!rows || rows.length === 0) {
    redirect(`/app/admin/tools/signed-url-cleanup?ok=cleaned_0`);
    return;
  }
  
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    // Prepare parallel updates
    const updates = chunk.map(async (r: any) => {
      const d = { ...(r.data ?? {}) };
      // Remove key entirely (safer than setting null)
      if ("signed_url" in d) {
        delete d.signed_url;
      } else {
        return; // nothing to change
      }
      const { error: uErr } = await supabase
        .from("module_content_blocks")
        .update({ data: d })
        .eq("id", r.id);
      if (!uErr) updated += 1;
    });
    await Promise.all(updates);
  }

  redirect(`/app/admin/tools/signed-url-cleanup?ok=cleaned_${updated}`);
}

// --- Page ------------------------------------------------------------------

export default async function SignedUrlCleanupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ok = (Array.isArray(params?.ok) ? params?.ok[0] : params?.ok) ?? null;
  const error =
    (Array.isArray(params?.error) ? params?.error[0] : params?.error) ?? null;

  const { affectedCount, sample } = await loadData();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools · Signed URL cleanup</h1>
          <p className="text-sm text-gray-600">
            Remove stale <code>signed_url</code> values from file blocks. Links are re-signed on demand later.
          </p>
        </div>
        <Link href="/app/admin" className="rounded-md border px-3 py-1 text-sm">
          Back to Admin
        </Link>
      </div>

      <Banner ok={ok} error={error} />

      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="text-sm">
          <strong>Affected blocks:</strong> {affectedCount}
        </div>
        <div className="flex items-center gap-2">
          <form action={dryRunAction}>
            <button className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">Dry run (refresh sample)</button>
          </form>
          <form action={runCleanupAction}>
            <button
              className="rounded-md bg-black px-3 py-1 text-sm text-white hover:opacity-90 disabled:opacity-50"
              disabled={affectedCount === 0}
              title={affectedCount === 0 ? "Nothing to clean" : "Remove signed_url from affected blocks"}
            >
              Run cleanup
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold mb-3">Sample (latest 25)</h2>
        {sample.length === 0 ? (
          <p className="text-sm text-gray-500">No affected blocks found.</p>
        ) : (
          <ul className="divide-y">
            {sample.map((b) => {
              const filename = (b.data && (b.data.filename || b.data.name)) ?? "(no filename)";
              const hasSigned = !!(b.data && b.data.signed_url);
              return (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{filename}</div>
                    <div className="text-xs text-gray-500">
                      Block #{b.id} • Module {b.module_id} • {b.created_at ? new Date(b.created_at).toLocaleString() : ""}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${
                      hasSigned ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {hasSigned ? "has signed_url" : "no signed_url"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-500">
        This tool only removes the stored <code>signed_url</code> value from each file block. It does not delete
        the underlying storage object. Your viewer/editor should sign URLs on demand when rendering.
      </p>
    </div>
  );
}
