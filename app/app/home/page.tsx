
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import Link from "next/link";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) redirect("/auth/login");

  // Get profile for welcome message
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="space-y-8">
      {/* Status messages */}
      {searchParams?.notice === "revoked" && (
        <div className="mb-4 rounded-md bg-yellow-50 p-4 border border-yellow-200">
          <div className="text-sm text-yellow-800">
            ✓ User assignment revoked
          </div>
        </div>
      )}

      {searchParams?.banner === "no_access" && (
        <div className="mb-4 rounded-md bg-red-50 p-4 border border-red-200">
          <div className="text-sm text-red-800">
            ⚠️ Sorry, you do not have access to that page. Please contact your administrator if you believe this is an error.
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
          {profile?.email && <p className="text-sm text-gray-600">{profile.email}</p>}
        </div>
        <div className="flex gap-2">
          <Link href="/app/myprofile" className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
            My profile
          </Link>
        </div>
      </div>

      {/* Release notes */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Release notes</h2>
        <div className="rounded-xl border bg-white p-4">
          <div className="space-y-3">
            <div>
              <div className="font-medium">Initial dashboard refresh</div>
              <div className="text-xs text-gray-500">19 DAYS, 2024</div>
            </div>
            <div className="text-sm text-gray-600">
              • New tiles on Homepage Release notes panel/box Enrollments shown on Home
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
