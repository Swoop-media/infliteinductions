// @ts-nocheck
// app/app/creator/authorisations/new/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

async function createNewAuthorisation() {
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

  // Refresh the list and redirect
  revalidatePath("/app/creator?tab=authorisations");
  redirect(`/app/creator/authorisations/${data.id}?tab=details&notice=saved`);
}

export default async function NewAuthorisationPage() {
  // Allow only creators/managers/admins
  const allowed =
    (await hasRole("Course creators")) ||
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

  // Call the server action directly
  try {
    await createNewAuthorisation();
  } catch (error) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-semibold">Authorisation</h1>
        <p className="text-red-600">{error.message}</p>
        <Link href="/app/creator?tab=authorisations" className="underline">Back</Link>
      </div>
    );
  }

  // This will never be reached due to redirect in server action
  return null;
}
