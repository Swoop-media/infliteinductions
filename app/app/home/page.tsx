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
          <h2 className="text-lg font-semibold">Version 1.0 - App Structure</h2>
          <div className="rounded-xl border bg-white p-4">
            <div className="space-y-4">
              <div>
                <div className="font-medium text-green-700">✓ Now Available</div>
                <div className="text-xs text-gray-500 mb-3">January 2025</div>
              </div>
              
              <div className="space-y-4 text-sm">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">👤 My Profile</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Personal dashboard with training progress</li>
                    <li>• Document management for licenses & certificates</li>
                    <li>• Microsoft Teams integration for notifications</li>
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
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">⚙️ Admin</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• User management and role assignment</li>
                    <li>• Enrollment approvals and system tools</li>
                    <li>• Analytics and completion tracking</li>
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
                    <li>• Compliance tracking and audit trails</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">🤖 AI-Powered Features</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Intelligent content recommendations</li>
                    <li>• Automated quiz generation</li>
                    <li>• Smart scheduling for onsite training</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">📱 Mobile Experience</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Progressive Web App (PWA) support</li>
                    <li>• Offline course content access</li>
                    <li>• Mobile-optimized assessments</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">🔗 Advanced Integrations</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• LMS and SCORM compatibility</li>
                    <li>• HR system integrations</li>
                    <li>• Calendar and scheduling apps</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">💡 Interactive Learning</h3>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Virtual reality training modules</li>
                    <li>• Interactive simulations</li>
                    <li>• Gamification and achievement systems</li>
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