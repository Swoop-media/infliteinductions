'use client';

import Link from 'next/link';
import CollapsibleSection from './CollapsibleSection';

interface HomeContentProps {
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  notice?: string;
  banner?: string;
}

export default function HomeContent({ profile, notice, banner }: HomeContentProps) {
  return (
    <div className="space-y-8">
      {/* Status messages */}
      {notice === "revoked" && (
        <div className="mb-4 rounded-md bg-yellow-50 p-4 border border-yellow-200">
          <div className="text-sm text-yellow-800">
            ✓ User assignment revoked
          </div>
        </div>
      )}

      {banner === "no_access" && (
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
        {/* Left column - Version 1.0 and Updates 1.1 */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Version 1.0 - App</h2>
          
          {/* Now Available - Collapsible */}
          <CollapsibleSection
            title="✓ Now Available"
            subtitle="September 2025"
            variant="available"
            defaultOpen={false}
          >
            <div className="space-y-4 text-sm pt-4">
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
          </CollapsibleSection>

          {/* Version 1.1 Updates - New Collapsible Section */}
          <h2 className="text-lg font-semibold mt-6">Version 1.1 - UPDATES</h2>
          <CollapsibleSection
            title="📋 Version 1.1 Updates"
            subtitle="13 September 2025"
            variant="updates"
            defaultOpen={false}
          >
            <div className="space-y-4 text-sm pt-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">📱 App</h3>
                <div className="space-y-2">
                  <div className="font-medium text-gray-700">Added contractors button</div>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• List of courses to select a external contractor to perform (quizzes not working)</li>
                    <li>• Record of contractors completed courses</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">🛠️ Creator</h3>
                <ul className="text-gray-600 space-y-1 ml-4">
                  <li>• Added the ability to add course as used for "external contractor"</li>
                  <li>• Added ability to filter courses by department</li>
                  <li>• Course creator - added ability to duplicate courses (quiz not duplicating, working on it but complicated)</li>
                  <li>• Published courses in details tab now list users who have completed that course version and gives creator the ability to notify them of courses changes and the requirement to retake course</li>
                  <li>• Power point use in creator investigated, short term solution add as a PDF</li>
                  <li>• In the rich text creator added the ability to alter text Bold, underline and bullet points etc</li>
                  <li>• Added the ability to paste and insert images in text modules</li>
                  <li>• Added the ability to add multiple types from dropdown of content into one module</li>
                  <li>• Fixed create new authorisation bug 🐛</li>
                </ul>
                
                <div className="mt-3">
                  <div className="font-medium text-gray-700">Onsite trainer and onsite assessor</div>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Added ability to test as learner from inside the modules</li>
                  </ul>
                </div>
                
                <div className="mt-3">
                  <div className="font-medium text-gray-700">Details tab</div>
                  <ul className="text-gray-600 space-y-1 ml-4">
                    <li>• Added the ability to check a box "use for external contractors"</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">⚙️ Admin</h3>
                <ul className="text-gray-600 space-y-1 ml-4">
                  <li>• App/admin - added course progress table that shows all unfinished courses and user progress in them, sortable by name, department etc</li>
                  <li>• Removed notifications to admins when a course is published</li>
                  <li>• Fixed assign user course creator roles bug 🐛</li>
                  <li>• Updated admin view of user profiles to include:</li>
                  <ul className="ml-4 mt-1">
                    <li>- Course/authorisation progress and ability to assign courses/authorisations from this page</li>
                  </ul>
                  <li>• Added a list of what courses the user has been assigned to be able to perform onsite training and onsite assessment</li>
                  <li>• Fixed admin/users/new bug 🐛</li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">👤 Learner</h3>
                <ul className="text-gray-600 space-y-1 ml-4">
                  <li>• Course player restructure size to make content in course larger, side bar of modules in course smaller</li>
                </ul>
              </div>
            </div>
          </CollapsibleSection>
        </section>

        {/* Right column - Future features */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">What&apos;s Coming in the Future</h2>
          
          <CollapsibleSection
            title="🚀 Planned Features"
            subtitle="Roadmap 2025"
            variant="planned"
            defaultOpen={false}
          >
            <div className="space-y-4 text-sm pt-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">📊 Enhanced Analytics</h3>
                <ul className="text-gray-600 space-y-1 ml-4">
                  <li>• Advanced reporting and dashboards</li>
                  <li>• Training completion trends and insights</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-900 mb-2">📊 New Features</h3>
                <ul className="text-gray-600 space-y-1 ml-4">
                  <li>• External Contractor courses</li>
                  <li>• Operations notices</li>
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
              
              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Have feature requests or suggestions? Contact your administrator.
                </p>
              </div>
            </div>
          </CollapsibleSection>
        </section>
      </div>
    </div>
  );
}