import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import Link from "next/link";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; banner?: string }>;
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

  const params = await searchParams;

  return (
    <div className="space-y-8">
      {/* Status messages */}
      {params?.notice === "revoked" && (
        <div className="mb-4 rounded-md bg-yellow-50 p-4 border border-yellow-200">
          <div className="text-sm text-yellow-800">
            ✓ User assignment revoked
          </div>
        </div>
      )}

      {params?.banner === "no_access" && (
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

      {/* Content sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Release notes */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Version 1.0 - App </h2>
          <div className="rounded-xl border bg-white p-4">
            <div className="space-y-4">
              <div>
                <div className="font-medium text-green-700">✓ Now Available</div>
                <div className="text-xs text-gray-500 mb-3">September 2025</div>
              </div>
              
              <div className="space-y-4 text-sm">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">👤 My Profile</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Personal dashboard with training progress</li>
                    <li>• Document management for licenses & certificates</li>
                    <li>• Microsoft Teams integration for notifications</li>
                    <li>• Completed courses and authorisations</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">📚 Learning & Courses</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Complete digital training modules with progress tracking</li>
                    <li>• Take quizzes with automatic grading</li>
                    <li>• Submit required documents during training</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">🛠️ Creator Tools</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Build courses with multiple module types</li>
                    <li>• Create authorization workflows</li>
                    <li>• Quiz builder with multiple question types</li>
                    <li>• Assignment of trainers and assesors for specific users</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">🎯 Train & Assess</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Conduct onsite training sessions</li>
                    <li>• Perform assessments with custom forms</li>
                    <li>• Monitor learner readiness for onsite components</li>
                    <li>• Recieve notification when onsite training and assessments are ready</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">⚙️ Admin</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• User management and role assignment</li>
                    <li>• approvals and system tools</li>
                    <li>• Analytics and completion tracking</li>
                    <li>• Course and authorisation due date control</li>
                    <li>• User records libary - exportable</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Future features */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">What's Coming in the Future</h2>
          <div className="rounded-xl border bg-white p-4">
            <div className="space-y-4">
              <div>
                <div className="font-medium text-blue-700">🚀 Planned Features</div>
                <div className="text-xs text-gray-500 mb-3">Roadmap 2025</div>
              </div>
              
              <div className="space-y-4 text-sm">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">📊 Enhanced Analytics</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Advanced reporting and dashboards</li>
                    <li>• Training completion trends and insights</li>
                    
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">🤖 AI-Powered Features</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Co pilot agent - Course creation</li>
                    <li>• Automated quiz generation</li>
                    <li>• Co Pilot Agent Auditing courses vs relevant rules, check and training manual</li>
                    <li>• Flows - assign a user there jobs and it will deliver appropriate authorisations in a set order</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">💡 Notifications</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• User options for recieving and opting out of notification types</li>
                    <li>• Comprehensive summaries sent to senior people</li>
                    <li>• Comprehensive help section</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">💡 Feedback</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• User feedback and improvements</li>
                    <li>• User requested features</li>
                  
                  </ul>
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Have feature requests or suggestions? Contact your administrator.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}