// @ts-nocheck
// DEBUG VERSION - app/app/myprofile/documents/debug-page.tsx
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function debugLoadDocs() {
  "use server";
  noStore();

  // First get current user
  const supabase = await createSupabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  
  // Also query with admin to compare
  const admin = supabaseAdmin();
  
  // Get ALL documents with admin to see what exists
  const { data: allDocs, error: allError } = await admin
    .from("learner_documents")
    .select("*")
    .order("created_at", { ascending: false });
  
  // Get user's documents with regular client
  let userDocs = null;
  let userError = null;
  if (user) {
    const result = await supabase
      .from("learner_documents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    userDocs = result.data;
    userError = result.error;
  }
  
  return {
    user,
    authErr,
    allDocs,
    allError,
    userDocs,
    userError
  };
}

export default async function DebugDocumentsPage() {
  const debug = await debugLoadDocs();
  
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents Debug Page</h1>
        <Link href="/app/myprofile" className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50">
          Back to home
        </Link>
      </div>

      <div className="rounded-md border bg-yellow-50 p-4">
        <h2 className="font-bold mb-2">Current User Info:</h2>
        <pre className="text-xs overflow-auto">
          {debug.authErr ? `Auth Error: ${debug.authErr}` : ''}
          {debug.user ? `User ID: ${debug.user.id}\nEmail: ${debug.user.email}` : 'No user logged in'}
        </pre>
      </div>

      <div className="rounded-md border bg-blue-50 p-4">
        <h2 className="font-bold mb-2">All Documents (Admin Query):</h2>
        <pre className="text-xs overflow-auto">
          {debug.allError ? `Error: ${debug.allError}` : ''}
          Total Documents: {debug.allDocs?.length || 0}
          {debug.allDocs && debug.allDocs.length > 0 && (
            <>
              {'\n\nSample documents:\n'}
              {debug.allDocs.slice(0, 3).map(doc => 
                `ID: ${doc.id}\nUser ID: ${doc.user_id}\nTitle: ${doc.title || doc.filename || 'No title'}\nPath: ${doc.file_path}\n---\n`
              ).join('')}
            </>
          )}
        </pre>
      </div>

      <div className="rounded-md border bg-green-50 p-4">
        <h2 className="font-bold mb-2">User's Documents (Regular Query):</h2>
        <pre className="text-xs overflow-auto">
          {debug.userError ? `Error: ${JSON.stringify(debug.userError)}` : ''}
          Documents Found: {debug.userDocs?.length || 0}
          {debug.userDocs && debug.userDocs.length > 0 && (
            <>
              {'\n\nUser documents:\n'}
              {debug.userDocs.map(doc => 
                `ID: ${doc.id}\nTitle: ${doc.title || doc.filename || 'No title'}\nPath: ${doc.file_path}\n---\n`
              ).join('')}
            </>
          )}
        </pre>
      </div>

      <div className="rounded-md border bg-gray-50 p-4">
        <h2 className="font-bold mb-2">Documents for Current User ID:</h2>
        <pre className="text-xs overflow-auto">
          {debug.user && debug.allDocs ? (
            <>
              Documents belonging to {debug.user.id}:
              {'\n'}
              {debug.allDocs.filter(doc => doc.user_id === debug.user.id).map(doc => 
                `- ${doc.title || doc.filename || doc.id}\n`
              ).join('')}
              {debug.allDocs.filter(doc => doc.user_id === debug.user.id).length === 0 && 
                'No documents found for this user ID in the database'}
            </>
          ) : 'Cannot check - no user or no documents'}
        </pre>
      </div>
    </div>
  );
}