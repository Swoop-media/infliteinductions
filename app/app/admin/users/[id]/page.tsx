// app/app/admin/users/[id]/page.tsx
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import Link from "next/link";

const DEPARTMENTS = [
  "Skydive Franz",
  "Skydive Mt Cook",
  "Skydive Abel Tasman",
  "Helitranz",
  "Engineering",
  "Mt Cook Skiplanes and Helicopters",
  "Franz and Fox Helicopters",
];

const JOBS = [
  "Front of house",
  "Ground crew",
  "Tandem master",
  "Camera flyer",
  "Driver",
  "Packer",
  "Helicopter pilot",
  "Fixed wing pilot",
  "Engineer",
];

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home");

  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  
  const supabase = await createSupabaseServer();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description")
    .eq("id", resolvedParams.id)
    .maybeSingle();

  const ok =
    (Array.isArray(resolvedSearchParams?.ok) ? resolvedSearchParams?.ok[0] : resolvedSearchParams?.ok) ?? null;
  const error =
    (Array.isArray(resolvedSearchParams?.error)
      ? resolvedSearchParams?.error[0]
      : resolvedSearchParams?.error) ?? null;

  if (!profile) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">User not found</h1>
        <Link className="text-sm underline" href="/app/admin?tab=users">
          ← Back to Users
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit User</h1>
        <Link className="text-sm underline" href="/app/admin?tab=users">
          ← Back to Users
        </Link>
      </div>

      {ok && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Saved.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        action="/app/app/admin/users/update"
        method="post"
        className="space-y-4 max-w-xl rounded-lg border bg-white p-4"
      >
        <input type="hidden" name="user_id" value={profile.id} />

        <div className="grid gap-1">
          <label className="text-sm font-medium">Full name</label>
          <input
            name="full_name"
            defaultValue={profile.full_name ?? ""}
            className="rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium">Email</label>
          <input
            disabled
            value={profile.email ?? ""}
            className="rounded-md border bg-gray-50 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium">Department</label>
          <select
            name="department"
            defaultValue={profile.department ?? ""}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium">Job description</label>
          <select
            name="job_description"
            defaultValue={profile.job_description ?? ""}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {JOBS.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button className="rounded-md bg-black px-3 py-2 text-sm text-white">Save</button>
          <Link href="/app/admin?tab=users" className="rounded-md border px-3 py-2 text-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
