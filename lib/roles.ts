"use server";

import { createSupabaseServer } from "@/lib/supabase/server";

/** Returns the current auth user (or null) */
export async function getSessionUser() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

/** Calls DB RPC has_role(uid, role_name) */
export async function hasRole(roleName: string) {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = createSupabaseServer();
  const { data, error } = await supabase.rpc("has_role", { uid: user.id, role_name: roleName });
  if (error) return false;
  return !!data;
}

/** v_profile_summary view returns profile + roles array */
export async function getProfileAndRoles() {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from("v_profile_summary")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return data ?? null;
}
