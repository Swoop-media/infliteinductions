// @ts-nocheck
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import HomeContent from "./HomeContent";

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
    <HomeContent 
      profile={profile}
      notice={params?.notice}
      banner={params?.banner}
    />
  );
}