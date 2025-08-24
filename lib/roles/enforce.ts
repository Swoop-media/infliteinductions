// lib/roles/enforce.ts
import { redirect } from "next/navigation";
import { hasRole } from "@/lib/roles";

/** Redirects to /app/home?banner=no_access if the user lacks ALL of the roles. */
export async function enforceAnyRoleOrHome(roles: string[], home = "/app/home") {
  for (const r of roles) {
    // assumes your hasRole(r: string): Promise<boolean>
    if (await hasRole(r)) return;
  }
  redirect(`${home}?banner=no_access`);
}
