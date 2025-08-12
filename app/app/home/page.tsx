import { createSupabaseServer } from "@/lib/supabase/server";
import Link from "next/link";

async function getMeAndNotifications() {
  const supabase = createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // profile + roles (for the little debug block you had)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_description")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const { data: myRoles } = await supabase
    .from("v_user_roles")
    .select("role")
    .eq("user_id", user?.id ?? "");

  // recent notifications
  const { data: notifs } = await supabase
    .from("notifications")
    .select("id, type, payload, read, created_at")
    .eq("recipient_id", user?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(10);

  return {
    profile,
    roles: (myRoles ?? []).map((r: any) => r.role),
    notifs: notifs ?? [],
  };
}

function labelFor(type: string, payload: any) {
  switch (type) {
    case "enrolment_approved":
      return "Enrolment approved";
    case "enrolment_request":
      return "New enrolment request";
    case "course_completed":
      return "Course completed";
    case "authorisation_ready":
      return "Authorisation ready";
    case "role_granted":
      return "Role granted";
    case "role_revoked":
      return "Role revoked";
    case "profile_updated":
      return "Profile updated";
    default:
      return type;
  }
}

function detailFor(type: string, payload: any) {
  switch (type) {
    case "enrolment_approved":
      return `You can start: ${payload?.course_title ?? "Course"}`;
    case "enrolment_request":
      return `Course: ${payload?.course_title ?? "-"}`;
    case "course_completed":
      return `Course: ${payload?.course_title ?? "-"}`;
    case "authorisation_ready":
      return `${payload?.user_name ?? "User"} — ${payload?.authorisation_title ?? "Authorisation"}`;
    case "role_granted":
      return `Granted: ${payload?.role_name ?? "-"}`;
    case "role_revoked":
      return `Revoked: ${payload?.role_name ?? "-"}`;
    case "profile_updated":
      return `Your profile information was updated.`;
    default:
      return "";
  }
}

export default async function HomePage() {
  const { profile, roles, notifs } = await getMeAndNotifications();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        Welcome, {profile?.full_name ?? "there"}
      </h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/app/courses"
          className="rounded-lg border bg-white p-4 hover:bg-gray-50"
        >
          <div className="font-medium">Courses & Authorisations</div>
          <div className="text-sm text-gray-600">
            Browse available courses and enrol.
          </div>
        </Link>

        <Link
          href="/app/my"
          className="rounded-lg border bg-white p-4 hover:bg-gray-50"
        >
          <div className="font-medium">My Training & Profile</div>
          <div className="text-sm text-gray-600">
            View your progress and update details.
          </div>
        </Link>

        <div className="rounded-lg border bg-white p-4">
          <div className="font-medium">Notifications</div>
          <div className="text-sm text-gray-600">
            {notifs.length === 0 ? (
              <span>No notifications yet.</span>
            ) : (
              <ul className="mt-2 space-y-2">
                {notifs.map((n: any) => (
                  <li key={n.id} className="rounded-md border p-2">
                    <div className="text-sm font-medium">
                      {labelFor(n.type, n.payload || {})}
                    </div>
                    <div className="text-xs text-gray-600">
                      {detailFor(n.type, n.payload || {})}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      {new Date(n.created_at).toLocaleString()}
                      {!n.read && (
                        <span className="ml-2 rounded bg-blue-50 px-1 py-[1px] text-[10px] uppercase text-blue-700">
                          new
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Optional: keep a small debug block */}
      {profile && (
        <pre className="rounded-md bg-[#0b1221] p-4 text-xs text-white">
{JSON.stringify(
  {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile["phone"] ?? null,
    department: profile.department,
    job_description: profile.job_description,
    roles,
  },
  null,
  2
)}
        </pre>
      )}
    </div>
  );
}

