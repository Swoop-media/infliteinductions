
import { createSupabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DebugNotificationsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) redirect("/auth/signin");

  // Get some test data
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title")
    .eq("status", "published")
    .limit(10);

  const { data: users } = await supabase
    .from("profiles")
    .select("id, name, email")
    .limit(20);

  return (
    <div className="space-y-6 p-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-semibold">Debug Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Debug the onsite training notification flow
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Check Notification Flow</h2>
          <form action="/api/debug/notification-flow" method="get" target="_blank" className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Select User:</label>
              <select name="userId" required className="w-full border rounded px-3 py-2">
                <option value="">Select a user...</option>
                {users?.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Select Course:</label>
              <select name="courseId" required className="w-full border rounded px-3 py-2">
                <option value="">Select a course...</option>
                {courses?.map(course => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>
            
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              Debug Flow
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-medium">Manual Trigger Test</h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800 mb-3">
              This will manually trigger the notification function for testing.
            </p>
            <form id="manualTriggerForm" className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Select User:</label>
                <select name="userId" required className="w-full border rounded px-3 py-2">
                  <option value="">Select a user...</option>
                  {users?.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Select Course:</label>
                <select name="courseId" required className="w-full border rounded px-3 py-2">
                  <option value="">Select a course...</option>
                  {courses?.map(course => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>
              
              <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
                Manual Trigger
              </button>
            </form>
            <div id="triggerResult" className="mt-3 text-sm"></div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Recent Notifications</h2>
        <RecentNotifications />
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
          document.getElementById('manualTriggerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            
            try {
              const response = await fetch('/api/debug/test-trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              
              const result = await response.json();
              document.getElementById('triggerResult').innerHTML = 
                '<pre class="bg-gray-100 p-2 rounded text-xs overflow-auto">' + 
                JSON.stringify(result, null, 2) + '</pre>';
            } catch (error) {
              document.getElementById('triggerResult').innerHTML = 
                '<div class="text-red-600">Error: ' + error.message + '</div>';
            }
          });
        `
      }} />
    </div>
  );
}

async function RecentNotifications() {
  const supabase = await createSupabaseServer();
  
  const { data: notifications } = await supabase
    .from("notifications")
    .select(`
      *,
      profiles!inner(name, email)
    `)
    .eq("type", "onsite_training_ready")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left">Recipient</th>
            <th className="px-4 py-2 text-left">Course</th>
            <th className="px-4 py-2 text-left">Learner</th>
            <th className="px-4 py-2 text-left">Created</th>
            <th className="px-4 py-2 text-left">Read</th>
          </tr>
        </thead>
        <tbody>
          {notifications?.map((notif) => (
            <tr key={notif.id} className="border-t">
              <td className="px-4 py-2">
                {(notif as any).profiles?.name || (notif as any).profiles?.email}
              </td>
              <td className="px-4 py-2">
                {notif.payload?.courseTitle || 'N/A'}
              </td>
              <td className="px-4 py-2">
                {notif.payload?.learnerName || 'N/A'}
              </td>
              <td className="px-4 py-2">
                {new Date(notif.created_at).toLocaleString()}
              </td>
              <td className="px-4 py-2">
                <span className={`px-2 py-1 text-xs rounded ${notif.read ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {notif.read ? 'Read' : 'Unread'}
                </span>
              </td>
            </tr>
          )) || (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                No notifications found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
