// @ts-nocheck

// @ts-nocheck

import { createSupabaseServer } from "@/lib/supabase/server";

export default async function TeamsDebugPage() {
  const supabase = await createSupabaseServer();
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div>Not authenticated</div>;
  }

  // Get all Teams links
  const { data: teamsLinks } = await supabase
    .from("teams_links")
    .select("*")
    .order("last_activity", { ascending: false });

  // Get current user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // Get user roles
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select(`
      roles(name)
    `)
    .eq("user_id", user.id);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Teams Debug Information</h1>
      
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Current User</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto">
            {JSON.stringify({ 
              id: user.id, 
              email: user.email,
              profile: profile,
              roles: userRoles?.map(ur => (ur as any)?.roles?.name).filter(Boolean)
            }, null, 2)}
          </pre>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Teams Links ({teamsLinks?.length || 0})</h2>
          <div className="space-y-2">
            {teamsLinks?.map((link, i) => (
              <div key={i} className="bg-gray-100 p-4 rounded">
                <div className="text-sm space-y-1">
                  <div><strong>User ID:</strong> {link.user_id || "None"}</div>
                  <div><strong>Teams User ID:</strong> {link.teams_user_id}</div>
                  <div><strong>AAD Object ID:</strong> {link.aad_object_id}</div>
                  <div><strong>Last Activity:</strong> {link.last_activity}</div>
                  <div><strong>Has Conversation Ref:</strong> {link.conversation_ref ? "Yes" : "No"}</div>
                  {link.conversation_ref && (
                    <details>
                      <summary className="cursor-pointer text-blue-600">Show Conversation Ref</summary>
                      <pre className="mt-2 text-xs bg-white p-2 rounded">
                        {JSON.stringify(link.conversation_ref, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            )) || <p>No Teams links found</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
