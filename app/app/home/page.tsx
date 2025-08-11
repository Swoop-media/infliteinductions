import { getProfileAndRoles } from "@/lib/roles";

export default async function Home() {
  const profile = await getProfileAndRoles();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}
      </h1>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-medium">Courses & Authorisations</h2>
          <p className="text-sm text-gray-600">Browse available courses and enrol.</p>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-medium">My Training & Profile</h2>
          <p className="text-sm text-gray-600">View your progress and update details.</p>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-medium">Notifications</h2>
          <p className="text-sm text-gray-600">In‑app updates appear here.</p>
        </div>
      </div>

      <pre className="rounded-md bg-gray-900 p-3 text-xs text-gray-100 overflow-auto">
{JSON.stringify(profile, null, 2)}
      </pre>
    </div>
  );
}
