import { createSupabaseServer } from "@/lib/supabase/server";

export default async function AdminDebug() {
  const supabase = createSupabaseServer();

  // who am I?
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  // role checks via RPC
  const { data: isAdmin, error: adminErr } = await supabase.rpc("has_role", {
    uid: user?.id ?? null,
    role_name: "Admin",
  });
  const { data: isTrainer, error: trainerErr } = await supabase.rpc(
    "has_role",
    { uid: user?.id ?? null, role_name: "Trainers and Assessors" }
  );

  // try the simplest possible read first (no joins)
  const { data: plainRows, error: plainErr } = await supabase
    .from("course_enrolments")
    .select("id, user_id, course_id, status, created_at")
    .order("created_at", { ascending: true })
    .limit(20);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Admin Debug</h1>

      <section className="space-y-2">
        <h2 className="font-medium">Auth</h2>
        <pre className="rounded border bg-white p-3 text-xs">
{JSON.stringify(
  {
    user: { id: user?.id, email: user?.email },
    userErr: userErr?.message ?? null,
  },
  null,
  2
)}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Roles</h2>
        <pre className="rounded border bg-white p-3 text-xs">
{JSON.stringify(
  {
    isAdmin,
    isTrainer,
    adminErr: adminErr?.message ?? null,
    trainerErr: trainerErr?.message ?? null,
  },
  null,
  2
)}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Plain enrolments (no joins)</h2>
        <pre className="rounded border bg-white p-3 text-xs">
{JSON.stringify(
  {
    count: plainRows?.length ?? 0,
    rows: plainRows,
    plainErr: plainErr?.message ?? null,
  },
  null,
  2
)}
        </pre>
      </section>
    </div>
  );
}
