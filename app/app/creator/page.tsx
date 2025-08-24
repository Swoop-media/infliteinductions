// app/app/creator/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import DeleteAuthorisationButton from "./_components/DeleteAuthorisationButton";

type CourseRow = {
  id: string;
  title: string | null;
  status: "draft" | "published" | "archived";
  updated_at: string;
  created_at: string;
  tags: string[] | null;
};

type AuthzRow = {
  id: string;
  title: string | null;
  status: "draft" | "active" | "archived";
  updated_at: string;
  created_at: string;
};

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "amber" | "gray";
}) {
  const tones: Record<string, string> = {
    default: "bg-gray-100 text-gray-800",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    gray: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function statusTone(status: CourseRow["status"] | AuthzRow["status"]) {
  switch (status) {
    case "published":
    case "active":
      return "green";
    case "draft":
      return "gray";
    case "archived":
      return "amber";
    default:
      return "default";
  }
}

function FlashBanner({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (ok) {
    const msg =
      ok === "course_deleted"
        ? "Course deleted."
        : ok === "authorisation_deleted"
        ? "Authorisation deleted."
        : "Saved.";
    return (
      <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
        {msg}
      </div>
    );
  }
  return null;
}

export default async function CreatorHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Guard: redirect unauthorized users to Home with banner
  const canAccess =
    (await hasRole("Course creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    redirect("/app/home?banner=no_access");
  }

  const sp = await searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) === "authorisations" ? "authorisations" : "courses";
  const ok = (Array.isArray(sp.ok) ? sp.ok[0] : sp.ok) ?? null;
  const error = (Array.isArray(sp.error) ? sp.error[0] : sp.error) ?? null;

  const supabase = await createSupabaseServer();

  const [{ data: courses = [] as CourseRow[] }, { data: authzs = [] as AuthzRow[] }] =
    await Promise.all([
      supabase
        .from("courses")
        .select("id,title,status,updated_at,created_at,tags")
        .order("updated_at", { ascending: false })
        .limit(25),
      supabase
        .from("authorisations")
        .select("id,title,status,updated_at,created_at")
        .order("updated_at", { ascending: false })
        .limit(25),
    ]);

  return (
    <div className="space-y-8">
      <FlashBanner ok={ok} error={error} />

      {/* Tab switcher */}
      <div className="flex items-center gap-2">
        <Link
          href="/app/creator?tab=courses"
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "courses" ? "bg-black text-white" : "border border-gray-200 hover:bg-gray-100"
          }`}
        >
          Courses
        </Link>
        <Link
          href="/app/creator?tab=authorisations"
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "authorisations" ? "bg-black text-white" : "border border-gray-200 hover:bg-gray-100"
          }`}
        >
          Authorisations
        </Link>
      </div>

      {tab === "courses" ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Courses</h2>
            <Link
              href="/app/creator/courses/new"
              className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Create Course
            </Link>
          </div>

          {courses.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No courses yet. Click <span className="font-medium">Create Course</span> to get started.
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {courses.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/app/creator/courses/${c.id}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {c.title || "Untitled"}
                      </Link>
                      <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      Updated {new Date(c.updated_at || c.created_at).toLocaleString()}
                      {Array.isArray(c.tags) && c.tags.length > 0 && (
                        <>
                          {" · "}
                          {c.tags.slice(0, 3).map((t, i) => (
                            <span key={t + i} className="mr-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px]">
                              {t}
                            </span>
                          ))}
                          {c.tags.length > 3 && <span className="text-[10px]">+{c.tags.length - 3}</span>}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/app/creator/courses/${c.id}`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/app/creator/courses/${c.id}/delete`}
                      className="rounded-md border px-3 py-1.5 text-sm border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      Delete
                    </Link>
                    <Link
                      href={`/app/creator/courses/${c.id}?tab=assignments`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                      Assign
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Authorisations</h2>
            <Link
              href="/app/creator/authorisations/new"
              className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Create Authorisation
            </Link>
          </div>

          {authzs.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No authorisations yet. Click <span className="font-medium">Create Authorisation</span> to add one.
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {authzs.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/app/creator/authorisations/${a.id}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {a.title || "Untitled"}
                      </Link>
                      <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      Updated {new Date(a.updated_at || a.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/app/creator/authorisations/${a.id}`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                      Edit
                    </Link>
                    <DeleteAuthorisationButton authId={a.id} title={a.title ?? undefined} />
                    <Link
                      href={`/app/creator/authorisations/${a.id}?tab=assignments`}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                    >
                      Assign
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
