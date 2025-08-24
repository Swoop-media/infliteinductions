// app/app/page.tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppIndexPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await (searchParams ?? Promise.resolve({}))) || {};
  const err = (Array.isArray(sp.error) ? sp.error[0] : sp.error) ?? null;
  const banner = (Array.isArray(sp.banner) ? sp.banner[0] : sp.banner) ?? null;

  if (err === "not_authorised") {
    redirect("/app/home?banner=no_access");
  }

  if (banner) {
    redirect(`/app/home?banner=${encodeURIComponent(banner)}`);
  }

  redirect("/app/home");
}
