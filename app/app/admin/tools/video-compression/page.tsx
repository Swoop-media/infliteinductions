// @ts-nocheck
// app/app/admin/tools/video-compression/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { hasRole } from "@/lib/roles";
import { createSupabaseService } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-blue-100 text-blue-800",
  processing: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  done: "bg-green-100 text-green-800",
  skipped: "bg-gray-100 text-gray-700",
};

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default async function VideoCompressionQueuePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  const resolved = (await searchParams) || {};
  const ok = Array.isArray(resolved.ok) ? resolved.ok[0] : resolved.ok;
  const error = Array.isArray(resolved.error) ? resolved.error[0] : resolved.error;
  const showAll = (Array.isArray(resolved.all) ? resolved.all[0] : resolved.all) === "1";

  const supabase = createSupabaseService();

  // Active (non-done) jobs — the ones admins need to see.
  const { data: activeJobs, error: activeError } = await supabase
    .from("video_compression_jobs")
    .select(
      "id, storage_path, block_id, module_id, original_bytes, output_bytes, status, attempts, error, created_at, started_at, finished_at"
    )
    .in("status", ["queued", "processing", "failed"])
    .order("created_at", { ascending: true });

  // Status counts for the summary strip.
  const { data: statusRows } = await supabase
    .from("video_compression_jobs")
    .select("status");
  const counts: Record<string, number> = {};
  for (const row of statusRows || []) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }

  // Recent completed/skipped jobs — hidden by default.
  let recentJobs: any[] = [];
  let recentError: any = null;
  if (showAll) {
    const { data, error: err } = await supabase
      .from("video_compression_jobs")
      .select(
        "id, storage_path, original_bytes, output_bytes, status, attempts, error, finished_at"
      )
      .in("status", ["done", "skipped"])
      .order("finished_at", { ascending: false })
      .limit(50);
    recentJobs = data || [];
    recentError = err;
  }

  // Resolve module titles for context (chunk .in() lists).
  const moduleIds = Array.from(
    new Set((activeJobs || []).map((j) => j.module_id).filter(Boolean))
  );
  const moduleById = new Map();
  for (let i = 0; i < moduleIds.length; i += 100) {
    const { data: mods } = await supabase
      .from("course_modules")
      .select("id, title")
      .in("id", moduleIds.slice(i, i + 100));
    for (const m of mods || []) moduleById.set(m.id, m);
  }

  const rows = activeJobs || [];
  const statusOrder = ["queued", "processing", "failed", "done", "skipped"];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools · Video optimisation queue</h1>
          <p className="text-sm text-gray-600 max-w-3xl">
            Background compression jobs for large module videos. A failed or stuck job means
            learners get the raw upload instead of the optimised version. Re-queue failed jobs
            below, or use the storage path to investigate manually.
          </p>
        </div>
        <Link href="/app/admin" className="rounded-md border px-3 py-1 text-sm">
          Back to Admin
        </Link>
      </div>

      {ok === "requeued" && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
          Job re-queued. It will be picked up on the next compression run.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {activeError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          Failed to load queue: {activeError.message}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {statusOrder.map((s) => (
          <div key={s} className="rounded-md border bg-white px-4 py-2 text-sm">
            <span
              className={`mr-2 rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[s] || "bg-gray-100 text-gray-700"}`}
            >
              {s}
            </span>
            <span className="font-semibold">{counts[s] || 0}</span>
          </div>
        ))}
      </div>

      {rows.length === 0 && !activeError ? (
        <div className="rounded-md border bg-white px-4 py-6 text-sm text-gray-600">
          No queued, processing, or failed jobs. All clear.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Storage path</th>
                <th className="px-4 py-2">Module</th>
                <th className="px-4 py-2">Size</th>
                <th className="px-4 py-2">Attempts</th>
                <th className="px-4 py-2">Queued</th>
                <th className="px-4 py-2">Started</th>
                <th className="px-4 py-2">Error</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((j) => {
                const mod = j.module_id ? moduleById.get(j.module_id) : null;
                return (
                  <tr key={j.id} className={j.status === "failed" ? "bg-red-50/50" : undefined}>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[j.status] || "bg-gray-100 text-gray-700"}`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <code className="break-all text-xs">{j.storage_path}</code>
                    </td>
                    <td className="px-4 py-2">{mod?.title || (j.module_id ? j.module_id : "—")}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtBytes(j.original_bytes)}</td>
                    <td className="px-4 py-2">{j.attempts}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtWhen(j.created_at)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtWhen(j.started_at)}</td>
                    <td className="px-4 py-2">
                      {j.error ? (
                        <span className="block max-w-xs break-words text-xs text-red-700">{j.error}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {j.status === "failed" && (
                        <form action="/app/admin/tools/video-compression/requeue" method="POST">
                          <input type="hidden" name="job_id" value={j.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-blue-300 px-3 py-1 text-xs text-blue-700 hover:bg-blue-50"
                          >
                            Re-queue
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div>
        {showAll ? (
          <Link
            href="/app/admin/tools/video-compression"
            className="text-sm text-blue-700 hover:underline"
          >
            Hide completed jobs
          </Link>
        ) : (
          <Link
            href="/app/admin/tools/video-compression?all=1"
            className="text-sm text-blue-700 hover:underline"
          >
            Show recent completed jobs
          </Link>
        )}
      </div>

      {showAll && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Recent completed / skipped (last 50)</h2>
          {recentError && (
            <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
              Failed to load completed jobs: {recentError.message}
            </div>
          )}
          {recentJobs.length === 0 && !recentError ? (
            <div className="rounded-md border bg-white px-4 py-4 text-sm text-gray-600">
              No completed jobs yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Storage path</th>
                    <th className="px-4 py-2">Original</th>
                    <th className="px-4 py-2">Output</th>
                    <th className="px-4 py-2">Finished</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentJobs.map((j) => (
                    <tr key={j.id}>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[j.status] || "bg-gray-100 text-gray-700"}`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <code className="break-all text-xs">{j.storage_path}</code>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{fmtBytes(j.original_bytes)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{fmtBytes(j.output_bytes)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{fmtWhen(j.finished_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
