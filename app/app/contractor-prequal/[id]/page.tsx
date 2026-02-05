// @ts-nocheck
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import PrequalReviewForm from "./PrequalReviewForm";

export const dynamic = "force-dynamic";

export default async function PrequalReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/signin?redirect=/app/contractor-prequal/${id}`);
  }

  const { data: submission, error } = await supabaseAdmin()
    .from("contractor_prequal_submissions")
    .select(`
      *,
      sites(name),
      sent_to:profiles!sent_to_user_id(id, full_name, email)
    `)
    .eq("id", id)
    .single();

  if (error || !submission) {
    console.error("Failed to fetch submission:", error);
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h1 className="text-xl font-semibold text-red-700 mb-2">Submission Not Found</h1>
          <p className="text-red-600">The pre-qualification submission you are looking for does not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <PrequalReviewForm 
        submission={submission} 
        currentUserId={user.id}
      />
    </div>
  );
}
