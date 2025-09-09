// @ts-nocheck
// app/app/creator/authorisations/[id]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";

/** Tabs */
type TabKey = "details" | "courses" | "assignments";
function tabKeyFromSearch(spObj: Record<string, string | string[] | undefined>): TabKey {
  const raw =
    typeof spObj.tab === "string"
      ? spObj.tab
      : Array.isArray(spObj.tab)
      ? spObj.tab[0]
      : undefined;
  switch (raw) {
    case "details": return "details";
    case "courses":
    case "add_courses": return "courses";
    case "assignments":
    case "assign": return "assignments";
    default: return "details";
  }
}
function tabLabel(t: TabKey) {
  switch (t) {
    case "details": return "Details";
    case "courses": return "Add courses";
    case "assignments": return "Assignments";
  }
}

/** Helpers */
function buildUrl(id: string, tab?: TabKey, notice?: string, extras?: Record<string,string>) {
  const p = new URLSearchParams();
  if (tab) p.set("tab", tab);
  if (notice) p.set("notice", notice);
  if (extras) for (const [k,v] of Object.entries(extras)) if (v) p.set(k, v);
  return `/app/creator/authorisations/${id}${p.toString() ? `?${p.toString()}` : ""}`;
}
function noticeMessage(code?: string) {
  switch (code) {
    case "saved": return "Saved.";
    case "status_updated": return "Status updated.";
    case "course_added": return "Course added.";
    case "course_removed": return "Course removed.";
    case "course_reordered": return "Order updated.";
    case "assigned": return "Person assigned.";
    case "revoked": return "Assignment revoked.";
    default: return null;
  }
}

/** Loaders */
async function loadAuth(authId: string) {
  "use server";
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data, error } = await supabase
    .from("authorisations")
    .select("*")
    .eq("id", authId)
    .single();

  if (error || !data) return { user, auth: null as any, err: error?.message ?? "Not found" };
  return { user, auth: data, err: null as string | null };
}

/** Chosen courses for this authorisation (with joined course fields) */
async function loadChosenCourses(authId: string) {
  "use server";
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("authorisation_courses")
    .select("id, order_index, course_id, courses!inner(id,title,department,tags,status)")
    .eq("authorisation_id", authId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    ac_id: r.id,
    course_id: r.course_id,
    order_index: r.order_index,
    title: r.courses?.title ?? "",
    department: r.courses?.department ?? null,
    tags: r.courses?.tags ?? [],
    status: r.courses?.status ?? "draft",
  }));
}

/** Search published courses with filters */
async function searchPublishedCourses(q: string, dept: string, tag: string) {
  "use server";
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("courses")
    .select("id,title,department,tags,status")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(50);

  const like = q?.trim() ? `%${q.trim()}%` : "";
  if (like) {
    query = query.or(`title.ilike.${like},description.ilike.${like}`);
  }
  if (dept) query = query.eq("department", dept);
  if (tag) query = query.contains("tags", [tag]);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** ACTIONS — Details/status */
async function saveDetailsAction(form: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const id = String(form.get("auth_id") || "");
  const next = String(form.get("next") || "") || buildUrl(id, "details", "saved");
  if (!id) throw new Error("Missing auth_id");

  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const validForStr = String(form.get("valid_for_days") || "");
  const deptSelect = String(form.get("department_select") || "").trim();
  const deptNew = String(form.get("department_new") || "").trim();
  const department = deptNew || deptSelect || null;
  const tagsCsv = String(form.get("tags_csv") || "").trim();
  const tags =
    tagsCsv.length === 0
      ? []
      : Array.from(new Set(tagsCsv.split(",").map((t) => t.trim()).filter(Boolean)));

  const patch: Record<string, any> = { description, department, tags };
  if (title) patch.title = title;
  if (validForStr !== "") {
    const n = Number(validForStr);
    patch.valid_for_days = Number.isFinite(n) ? n : null;
  }

  const { error } = await supabase.from("authorisations").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(buildUrl(id));
  redirect(next);
}
async function saveStatusAction(form: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const id = String(form.get("auth_id") || "");
  const status = String(form.get("status") || "draft") as "draft" | "active" | "archived";
  const next = String(form.get("next") || "") || buildUrl(id, "details", "status_updated");
  if (!id) throw new Error("Missing auth_id");

  const { error } = await supabase.from("authorisations").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(buildUrl(id));
  redirect(next);
}

/** ACTIONS — manage selected courses */
async function addCourseAction(form: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const authId = String(form.get("auth_id") || "");
  const courseId = String(form.get("course_id") || "");
  if (!authId || !courseId) throw new Error("Missing ids");

  // next order
  const { data: maxRow, error: mErr } = await supabase
    .from("authorisation_courses")
    .select("order_index")
    .eq("authorisation_id", authId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  const nextOrder = (maxRow?.order_index ?? -1) + 1;

  const { error } = await supabase
    .from("authorisation_courses")
    .insert({ authorisation_id: authId, course_id: courseId, order_index: nextOrder });
  if (error && (error as any).code !== "23505") throw new Error(error.message); // ignore duplicate

  revalidatePath(buildUrl(authId));
  redirect(buildUrl(authId, "courses", "course_added"));
}
async function removeCourseAction(form: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const authId = String(form.get("auth_id") || "");
  const acId = String(form.get("ac_id") || "");
  if (!authId || !acId) throw new Error("Missing ids");

  const { error } = await supabase.from("authorisation_courses").delete().eq("id", acId);
  if (error) throw new Error(error.message);

  // renumber
  const { data: rest } = await supabase
    .from("authorisation_courses")
    .select("id, order_index")
    .eq("authorisation_id", authId)
    .order("order_index");
  if (rest?.length) {
    for (let i = 0; i < rest.length; i++) {
      const r = rest[i] as any;
      if (r.order_index !== i) {
        await supabase.from("authorisation_courses").update({ order_index: i }).eq("id", r.id);
      }
    }
  }

  revalidatePath(buildUrl(authId));
  redirect(buildUrl(authId, "courses", "course_removed"));
}
async function moveCourseAction(form: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const authId = String(form.get("auth_id") || "");
  const acId = String(form.get("ac_id") || "");
  const dir = String(form.get("direction") || "up"); // up|down
  if (!authId || !acId) throw new Error("Missing ids");

  const { data: me, error: mErr } = await supabase
    .from("authorisation_courses")
    .select("id, order_index")
    .eq("id", acId)
    .maybeSingle();
  if (mErr || !me) throw new Error(mErr?.message || "Row missing");
  const cur = (me as any).order_index ?? 0;

  let neighbor: { id: string; order_index: number } | null = null;
  if (dir === "up") {
    const { data } = await supabase
      .from("authorisation_courses")
      .select("id, order_index")
      .eq("authorisation_id", authId)
      .lt("order_index", cur)
      .order("order_index", { ascending: false })
      .limit(1);
    neighbor = (data?.[0] as any) ?? null;
  } else {
    const { data } = await supabase
      .from("authorisation_courses")
      .select("id, order_index")
      .eq("authorisation_id", authId)
      .gt("order_index", cur)
      .order("order_index", { ascending: true })
      .limit(1);
    neighbor = (data?.[0] as any) ?? null;
  }

  if (neighbor) {
    await supabase.from("authorisation_courses").update({ order_index: neighbor.order_index }).eq("id", acId);
    await supabase.from("authorisation_courses").update({ order_index: cur }).eq("id", neighbor.id);
  }

  revalidatePath(buildUrl(authId));
  redirect(buildUrl(authId, "courses", "course_reordered"));
}

/** Search profiles for assignments */
async function searchProfilesByQuery(q: string) {
  "use server";
  if (!q || !q.trim()) return [];
  const supabase = await createSupabaseServer();
  const like = `%${q.trim()}%`;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .order("full_name", { ascending: true })
    .limit(12);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** ACTIONS — assignments */
async function assignUserAction(form: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const authId = String(form.get("auth_id") || "");
  const userId = String(form.get("user_id") || "");
  const role = String(form.get("role") || "trainee");
  const next = String(form.get("next") || "") || buildUrl(authId, "assignments", "assigned");
  if (!authId || !userId) throw new Error("Missing ids");

  const { data: { user } } = await supabase.auth.getUser();
  const assigned_by = user?.id ?? null;

  const { error } = await supabase
    .from("authorisation_assignments")
    .insert({ authorisation_id: authId, user_id: userId, role, assigned_by });

  // ignore unique conflicts
  if (error && (error as any).code !== "23505") throw new Error(error.message);

  revalidatePath(buildUrl(authId));
  redirect(next);
}
async function revokeAssignmentAction(form: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const authId = String(form.get("auth_id") || "");
  const assignmentId = String(form.get("assignment_id") || "");
  const next = String(form.get("next") || "") || buildUrl(authId, "assignments", "revoked");
  if (!authId || !assignmentId) throw new Error("Missing ids");

  const { error } = await supabase.from("authorisation_assignments").delete().eq("id", assignmentId);
  if (error) throw new Error(error.message);

  revalidatePath(buildUrl(authId));
  redirect(next);
}

/** Page */
// Define proper types for search parameters
type SearchParamsType = {
  notice?: string | string[];
  error?: string | string[];
  tab?: string | string[];
  q?: string | string[];
  dept?: string | string[];
  tag?: string | string[];
  [key: string]: string | string[] | undefined;
};

export default async function Page(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParamsType>;
}) {
  const { id } = await props.params;

  // 🔒 Guard: if someone hits /authorisations/new on this [id] page, forward to the real creator route
  if (id === "new") {
    redirect("/app/creator/authorisations/new");
  }

  const search: SearchParamsType = (await (props.searchParams ?? Promise.resolve({}))) || {};
  const activeTab = tabKeyFromSearch(search);
  const banner = noticeMessage(
    (Array.isArray(search.notice) ? search.notice[0] : search.notice) || undefined
  );

  const { auth, err } = await loadAuth(id);
  if (err || !auth) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Authorisation</h1>
        <p className="text-red-600">{err ?? "Not found"}</p>
        <Link href="/app/creator?tab=authorisations" className="underline">Back</Link>
      </div>
    );
  }

  // Preload depending on tab
  let chosenCourses: any[] = [];
  let searchResults: any[] = [];
  if (activeTab === "courses") {
    chosenCourses = await loadChosenCourses(id);
    const q = (Array.isArray(search.q) ? search.q[0] : search.q) ?? "";
    const dept = (Array.isArray(search.dept) ? search.dept[0] : search.dept) ?? "";
    const tag = (Array.isArray(search.tag) ? search.tag[0] : search.tag) ?? "";
    searchResults = await searchPublishedCourses(q, dept, tag);
  }

  // Assignments preload (and optional search)
  let assignments: any[] = [];
  let profileMap = new Map<string, { id: string; full_name: string|null; email: string|null }>();
  let assignSearchResults: any[] = [];
  if (activeTab === "assignments") {
    const supabase = await createSupabaseServer();
    const { data: rows } = await supabase
      .from("authorisation_assignments")
      .select("id, user_id, authorisation_id, role, created_at, created_by")
      .eq("authorisation_id", id)
      .order("created_at", { ascending: false });
    assignments = rows ?? [];
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      (profs ?? []).forEach((p: any) => profileMap.set(p.id, p));
    }
    const q = (Array.isArray(search.q) ? search.q[0] : search.q) ?? "";
    assignSearchResults = await searchProfilesByQuery(q);
  }

  const tabs: { key: TabKey; href: string }[] = [
    { key: "details", href: buildUrl(id, "details") },
    { key: "courses", href: buildUrl(id, "courses") },
    { key: "assignments", href: buildUrl(id, "assignments") },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{auth.title ?? "Untitled Authorisation"}</h1>
        </div>
        <Link href="/app/creator?tab=authorisations" className="rounded-md border px-3 py-1 text-sm">
          Back
        </Link>
      </div>

      {banner && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          {banner}
        </div>
      )}

      <div className="flex gap-2">
        {tabs.map((t) => {
          const isActive = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`rounded-md px-3 py-1 text-sm ${isActive ? "bg-black text-white" : "border hover:bg-gray-50"}`}
            >
              {tabLabel(t.key)}
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border p-4">
        {activeTab === "details" && <DetailsTab auth={auth} />}

        {activeTab === "courses" && (
          <CoursesTab authId={id} chosen={chosenCourses} results={searchResults} search={search} />
        )}

        {activeTab === "assignments" && (
          <AssignmentsTab
            authId={id}
            assignments={assignments}
            profileMap={profileMap}
            searchResults={assignSearchResults}
            search={search}
          />
        )}
      </div>
    </div>
  );
}

/** ---- Details Tab ---- */
const DEFAULT_DEPTS = ["Skydive","Helicopter","Fixed wing","Inflite general","Safety"] as const;

function DetailsTab({ auth }: { auth: any }) {
  const tagsCsv = Array.isArray(auth.tags) ? (auth.tags as string[]).join(", ") : "";
  return (
    <div className="space-y-8">
      <form action={saveDetailsAction} className="space-y-4">
        <input type="hidden" name="auth_id" value={auth.id} />
        <input type="hidden" name="next" value={buildUrl(auth.id, "details", "saved")} />

        <div className="grid gap-2">
          <label className="text-sm">Title</label>
          <input name="title" defaultValue={auth.title ?? ""} className="w-full rounded-md border px-3 py-2" />
        </div>

        <div className="grid gap-2">
          <label className="text-sm">Description</label>
          <textarea
            name="description"
            defaultValue={auth.description ?? ""}
            className="w-full rounded-md border px-3 py-2 min-h-[120px]"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm">Valid for (days)</label>
          <select
            name="valid_for_days"
            defaultValue={auth.valid_for_days == null ? "" : String(auth.valid_for_days)}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="">— Select period —</option>
            <option value="0">No expiry</option>
            <option value="30">30 days</option>
            <option value="90">90 days (3 months)</option>
            <option value="180">180 days (6 months)</option>
            <option value="365">365 days (1 year)</option>
            <option value="730">730 days (2 years)</option>
            <option value="1095">1095 days (3 years)</option>
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-sm">Department</label>
          <select
            name="department_select"
            defaultValue={auth.department ?? ""}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="">— Select department —</option>
            {DEFAULT_DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input
            name="department_new"
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="Or type a new department"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm">Tags</label>
          <input
            name="tags_csv"
            defaultValue={tagsCsv}
            className="w-full rounded-md border px-3 py-2"
            placeholder="e.g. safety, refresher"
          />
          <div className="text-xs text-gray-500">Comma-separated, used for filtering.</div>
        </div>

        <div className="pt-2">
          <button className="rounded-md bg-black px-4 py-2 text-white">Save</button>
        </div>
      </form>

      <div className="rounded-lg border p-4 space-y-2">
        <div className="font-semibold">Status</div>
        <form action={saveStatusAction} className="flex items-center gap-2">
          <input type="hidden" name="auth_id" value={auth.id} />
          <input type="hidden" name="next" value={buildUrl(auth.id, "details", "status_updated")} />
          <select
            name="status"
            defaultValue={auth.status ?? "draft"}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Update</button>
        </form>
      </div>
    </div>
  );
}

/** ---- Add Courses Tab ---- */
function CoursesTab({
  authId,
  chosen,
  results,
  search,
}: {
  authId: string;
  chosen: Array<{ ac_id: string; course_id: string; order_index: number; title: string; department: string|null; tags: string[] }>;
  results: Array<{ id: string; title: string; department: string|null; tags: string[] }>;
  search: Record<string, string | string[] | undefined>;
}) {
  const q = (Array.isArray(search.q) ? search.q[0] : search.q) ?? "";
  const dept = (Array.isArray(search.dept) ? search.dept[0] : search.dept) ?? "";
  const tag = (Array.isArray(search.tag) ? search.tag[0] : search.tag) ?? "";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: Selected list (ordered) */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Selected courses (order learners must complete)</h3>
        {chosen.length === 0 ? (
          <p className="text-sm text-gray-500">No courses yet. Search on the right to add.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-white">
            {chosen.map((c) => (
              <li key={c.ac_id} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-gray-500">
                    {c.department || "—"} {c.tags?.length ? `• ${c.tags.join(", ")}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <form action={moveCourseAction}>
                    <input type="hidden" name="auth_id" value={authId} />
                    <input type="hidden" name="ac_id" value={c.ac_id} />
                    <input type="hidden" name="direction" value="up" />
                    <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" title="Up">↑</button>
                  </form>
                  <form action={moveCourseAction}>
                    <input type="hidden" name="auth_id" value={authId} />
                    <input type="hidden" name="ac_id" value={c.ac_id} />
                    <input type="hidden" name="direction" value="down" />
                    <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" title="Down">↓</button>
                  </form>
                  <form action={removeCourseAction}>
                    <input type="hidden" name="auth_id" value={authId} />
                    <input type="hidden" name="ac_id" value={c.ac_id} />
                    <button className="rounded border px-2 py-1 text-xs hover:bg-red-50">Remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: Search/picker */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Add courses</h3>
        <form method="get" action={buildUrl(authId, "courses")}>
          <input type="hidden" name="tab" value="courses" />
          <div className="flex flex-wrap gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search title/description…"
              className="w-56 rounded-md border px-3 py-2 text-sm"
            />
            <select name="dept" defaultValue={dept} className="rounded-md border px-3 py-2 text-sm">
              <option value="">Any department</option>
              {DEFAULT_DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input
              name="tag"
              defaultValue={tag}
              placeholder="Tag (exact)"
              className="w-40 rounded-md border px-3 py-2 text-sm"
            />
            <button className="rounded-md border px-3 py-2 text-sm">Filter</button>
          </div>
        </form>

        {results.length === 0 ? (
          <p className="text-sm text-gray-500">No matching published courses.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-white">
            {results.map((c) => (
              <li key={c.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-gray-500">
                    {c.department || "—"} {c.tags?.length ? `• ${c.tags.join(", ")}` : ""}
                  </div>
                </div>
                <form action={addCourseAction}>
                  <input type="hidden" name="auth_id" value={authId} />
                  <input type="hidden" name="course_id" value={c.id} />
                  <button className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50">Add</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** ---- Assignments Tab ---- */
function AssignmentsTab({
  authId,
  assignments,
  profileMap,
  searchResults,
  search,
}: {
  authId: string;
  assignments: Array<{ id: string; user_id: string; role: string }>;
  profileMap: Map<string, { id: string; full_name: string|null; email: string|null }>;
  searchResults: Array<{ id: string; full_name: string|null; email: string|null }>;
  search: Record<string, string | string[] | undefined>;
}) {
  const q = (Array.isArray(search.q) ? search.q[0] : search.q) ?? "";

  return (
    <div className="space-y-6">
      {/* Search & assign */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Assign people</h2>
          <form method="get" action={buildUrl(authId, "assignments")}>
            <input type="hidden" name="tab" value="assignments" />
            <div className="flex items-center gap-2">
              <input
                type="text"
                name="q"
                defaultValue={q}
                className="w-72 rounded-md border px-3 py-2 text-sm"
                placeholder="Search name or email"
              />
              <button className="rounded-md border px-3 py-2 text-sm">Search</button>
            </div>
          </form>
        </div>

        {searchResults.length > 0 ? (
          <ul className="divide-y rounded-md border bg-white">
            {searchResults.map((p) => (
              <li key={p.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-medium">{p.full_name ?? "(no name)"}</div>
                  <div className="text-xs text-gray-500">{p.email ?? ""}</div>
                </div>
                <form action={assignUserAction} className="flex items-center gap-2">
                  <input type="hidden" name="auth_id" value={authId} />
                  <input type="hidden" name="user_id" value={p.id} />
                  <input type="hidden" name="role" value="trainee" />
                  <input type="hidden" name="next" value={buildUrl(authId, "assignments", "assigned")} />
                  <button className="rounded-md bg-black px-3 py-1 text-xs text-white">Assign</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Search to find people to assign.</p>
        )}
      </div>

      {/* Current */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-lg font-semibold">Current assignments</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-gray-500">No one assigned yet.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-white">
            {assignments.map((a) => {
              const p = profileMap.get(a.user_id);
              return (
                <li key={a.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">{p?.full_name ?? a.user_id}</div>
                    <div className="text-xs text-gray-500">{p?.email ?? ""} • {a.role}</div>
                  </div>
                  <form action={revokeAssignmentAction}>
                    <input type="hidden" name="auth_id" value={authId} />
                    <input type="hidden" name="assignment_id" value={a.id} />
                    <input type="hidden" name="next" value={buildUrl(authId, "assignments", "revoked")} />
                    <button className="rounded-md border px-2 py-1 text-xs hover:bg-red-50">Revoke</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
