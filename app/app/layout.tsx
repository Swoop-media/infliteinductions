import Sidebar from "@/components/Sidebar";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

async function getUser() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/");

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3">
          <div />
          <form action="/auth/signout" method="post">
            <button className="rounded-md border px-3 py-1 text-sm">Sign out</button>
          </form>
        </header>
        <main className="p-4">{children}</main>
      </div>
    </div>
  );
}
