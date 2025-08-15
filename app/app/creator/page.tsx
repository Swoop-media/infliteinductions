import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

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

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "green" | "amber" | "gray" }) {
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

export default async function CreatorHome({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  // Guard again (cheap, keeps page consistent if layout changes)
  const canAccess =
    (await hasRole("Course creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    // Render nothing; layout will have redirected already.
    return null;
  }

  const tab = (searchParams?.tab === "authorisations" ? "authorisations" : "courses") as
    | "courses"
    | "authorisations";

  const supabase = createSupabaseServer();

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
      {/* Tab switcher (redundant to header links, but nice inline UI) */}
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
                      href={`/app/creator/courses/${c.id}?tab=assign`}
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
                    <Link
                      href={`/app/creator/authorisations/${a.id}?tab=assign`}
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
