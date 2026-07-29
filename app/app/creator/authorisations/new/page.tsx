// @ts-nocheck
// app/app/creator/authorisations/new/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import { logContentAudit } from "@/lib/audit";

async function createNewAuthorisation(formData: FormData) {
  "use server";
  
  const supabase = await createSupabaseServer();
  
  // Must be signed in
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  
  if (authErr || !user) {
    throw new Error("Authentication required");
  }

  // Create a draft authorisation
  const payload: Record<string, any> = {
    title: "New Authorisation",
    status: "draft",
  };

  const { data, error } = await supabase
    .from("authorisations")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || "Failed to create authorisation.");
  }

  await logContentAudit({
    entityType: "authorisation",
    entityId: data.id,
    entityName: "New Authorisation",
    action: "created",
    actorId: user.id,
  });

  // Refresh the list and redirect
  revalidatePath("/app/creator?tab=authorisations");
  redirect(`/app/creator/authorisations/${data.id}?tab=details&notice=saved`);
}

export default async function NewAuthorisationPage() {
  // Allow only creators/managers/admins
  const allowed =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!allowed) redirect("/app/home");

  const supabase = await createSupabaseServer();

  // Must be signed in
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-semibold">Authorisation</h1>
        <p className="text-red-600">{authErr.message}</p>
        <Link href="/auth/login" className="underline">Sign in</Link>
      </div>
    );
  }
  if (!user) redirect("/auth/login");

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Create New Authorisation</h1>
        <p className="text-gray-600">
          Click the button below to create a new authorisation draft that you can then edit.
        </p>
      </div>
      
      <form action={createNewAuthorisation} className="space-y-4">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Create New Authorisation
        </button>
      </form>
      
      <div className="pt-4 border-t">
        <Link 
          href="/app/creator?tab=authorisations" 
          className="text-blue-600 hover:underline"
        >
          ← Back to Authorisations
        </Link>
      </div>
    </div>
  );
}
