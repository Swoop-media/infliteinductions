// @ts-nocheck
// app/app/creator/operations-notices/[id]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import BatchUserAssignment from "./BatchUserAssignment";
import { notifyUser } from "@/lib/notifications/dispatcher";
import { toAbsoluteUrl } from "@/lib/utils/url";
import DetailsTabClient from "./_components/DetailsTabClient";

type TabKey = "details" | "assignments";

function tabLabel(t: TabKey) {
  switch (t) {
    case "details": return "Details";
    case "assignments": return "Assignments";
  }
}

function tabKeyFromSearch(spObj: Record<string, string | string[] | undefined>): TabKey {
  const raw =
    typeof spObj.tab === "string"
      ? spObj.tab
      : Array.isArray(spObj.tab)
      ? spObj.tab[0]
      : undefined;
  switch (raw) {
    case "details": return "details";
    case "assignments": return "assignments";
    default: return "details";
  }
}

function buildNoticeUrl(noticeId: string, tab?: TabKey, notice?: string) {
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  if (notice) params.set("notice", notice);
  return `/app/creator/operations-notices/${noticeId}${params.toString() ? `?${params.toString()}` : ""}`;
}

function noticeMessage(code?: string) {
  switch (code) {
    case "saved": return "Saved.";
    case "status_updated": return "Notice status updated.";
    case "assigned": return "Person assigned to notice.";
    case "revoked": return "Assignment revoked.";
    default: return null;
  }
}

type NoticeRow = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  require_acknowledgement: boolean;
  department: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  responsible_person: string | null;
  valid_for_days: number | null;
};

type ResponsiblePerson = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type AssignmentRow = {
  id: string;
  user_id: string;
  notice_id: string;
  role: "recipient";
  created_at: string | null;
  assigned_by: string | null;
};

type AcknowledgementRow = {
  id: string;
  user_id: string;
  notice_id: string;
  acknowledged_at: string;
};

type Profile = { id: string; full_name: string | null; email: string | null };
type ProfileWithDepartment = { id: string; full_name: string | null; email: string | null; department: string | null };

async function loadNotice(noticeId: string) {
  "use server";
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data: notice, error } = await supabase
    .from("operations_notices")
    .select("*")
    .eq("id", noticeId)
    .maybeSingle();

  if (error || !notice) {
    return { user, notice: null, err: error?.message ?? "Notice not found" };
  }
  return { user, notice: notice as NoticeRow, err: null };
}

async function loadAssignments(noticeId: string) {
  "use server";
  const supabase = await createSupabaseServer();

  const { data: rows, error } = await supabase
    .from("operations_notice_assignments")
    .select("id, user_id, notice_id, role, created_at, assigned_by")
    .eq("notice_id", noticeId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const userIds = Array.from(new Set((rows ?? []).map(r => r.user_id)));
  const profileMap = new Map<string, Profile>();

  if (userIds.length) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    if (pErr) throw new Error(pErr.message);
    (profs ?? []).forEach(p => profileMap.set(p.id, p as Profile));
  }

  return { assignments: (rows ?? []) as AssignmentRow[], profileMap };
}

async function loadAcknowledgements(noticeId: string) {
  "use server";
  const supabase = await createSupabaseServer();

  const { data: rows, error } = await supabase
    .from("operations_notice_acknowledgements")
    .select("id, user_id, notice_id, acknowledged_at")
    .eq("notice_id", noticeId);
  if (error) throw new Error(error.message);

  return new Set((rows ?? []).map(r => r.user_id));
}

async function searchProfilesByQuery(q: string | null) {
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
  return (data ?? []) as Profile[];
}

async function loadAllDepartments() {
  "use server";
  const supabase = await createSupabaseServer();
  
  const { data: departments, error } = await supabase
    .from("departments")
    .select("name")
    .order("name", { ascending: true });
  
  if (error) {
    console.error("Error loading departments:", error);
    return [];
  }
  
  return departments?.map(dept => dept.name).filter(Boolean) || [];
}

async function loadAllUsersWithDepartments() {
  "use server";
  const supabase = await createSupabaseServer();
  
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, department")
    .is("archived_at", null)
    .order("full_name", { ascending: true });
  
  if (error) {
    console.error("Error loading users:", error);
    return [];
  }
  
  return (users ?? []) as ProfileWithDepartment[];
}

async function loadResponsiblePersons(): Promise<ResponsiblePerson[]> {
  "use server";
  const supabase = await createSupabaseServer();
  
  const { data: roles, error: rolesError } = await supabase
    .from("roles")
    .select("id, name")
    .in("name", ["Senior Management", "Admin"]);
  
  if (rolesError) {
    console.error("Error loading roles:", rolesError);
    return [];
  }
  
  if (!roles || roles.length === 0) {
    return [];
  }
  
  const roleIds = roles.map(r => r.id);
  const roleMap = new Map(roles.map(r => [r.id, r.name]));
  
  const { data: userRoles, error: userRolesError } = await supabase
    .from("user_roles")
    .select("user_id, role_id")
    .in("role_id", roleIds);
  
  if (userRolesError) {
    console.error("Error loading user roles:", userRolesError);
    return [];
  }
  
  if (!userRoles || userRoles.length === 0) {
    return [];
  }
  
  const userIds = [...new Set(userRoles.map(ur => ur.user_id))];
  
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);
  
  if (profilesError) {
    console.error("Error loading profiles:", profilesError);
    return [];
  }
  
  const userRolesMap = new Map<string, string[]>();
  userRoles.forEach(ur => {
    if (!userRolesMap.has(ur.user_id)) {
      userRolesMap.set(ur.user_id, []);
    }
    const roleName = roleMap.get(ur.role_id);
    if (roleName && !userRolesMap.get(ur.user_id)!.includes(roleName)) {
      userRolesMap.get(ur.user_id)!.push(roleName);
    }
  });
  
  const users = (profiles || []).map(profile => ({
    id: profile.id,
    name: profile.full_name || 'Unknown',
    email: profile.email || '',
    role: userRolesMap.get(profile.id)?.join(', ') || 'Unknown'
  }));
  
  return users.sort((a, b) => a.name.localeCompare(b.name));
}

async function updateNoticeStatusAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const noticeId = String(formData.get("notice_id") || "");
  const status = String(formData.get("status") || "draft") as "draft" | "published" | "archived";
  const next = String(formData.get("next") || "") || buildNoticeUrl(noticeId, "details", "status_updated");
  if (!noticeId) throw new Error("Missing notice_id");

  const { error } = await supabase.from("operations_notices").update({ status }).eq("id", noticeId);
  if (error) throw new Error(error.message);

  revalidatePath(buildNoticeUrl(noticeId));
  redirect(next);
}

async function updateNoticeDetails(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const noticeId = String(formData.get("notice_id") || "");
  const next = String(formData.get("next") || "") || buildNoticeUrl(noticeId, "details", "saved");
  if (!noticeId) throw new Error("Missing notice_id");

  const title = String(formData.get("title") || "").trim();
  const requireAcknowledgement = formData.get("require_acknowledgement") === "on";

  const deptSelect = String(formData.get("department_select") || "").trim();
  const department = deptSelect || null;

  const tagsCsv = String(formData.get("tags_csv") || "").trim();
  const tags =
    tagsCsv.length === 0
      ? []
      : Array.from(new Set(tagsCsv.split(",").map((t) => t.trim()).filter(Boolean)));

  const responsiblePerson = String(formData.get("responsible_person") || "").trim() || null;
  
  const validForDaysStr = String(formData.get("valid_for_days") || "").trim();
  let validForDays: number | null = null;
  if (validForDaysStr !== "") {
    const val = Number(validForDaysStr);
    validForDays = Number.isFinite(val) && val >= 0 ? val : null;
  }

  const updatePayload: Record<string, any> = {};
  if (title.length > 0) updatePayload.title = title;
  updatePayload.require_acknowledgement = requireAcknowledgement;
  updatePayload.department = department;
  updatePayload.tags = tags;
  updatePayload.responsible_person = responsiblePerson;
  updatePayload.valid_for_days = validForDays;

  const { error } = await supabase.from("operations_notices").update(updatePayload).eq("id", noticeId);
  if (error) throw new Error(`Save failed: ${error.message}`);

  revalidatePath(buildNoticeUrl(noticeId));
  redirect(next);
}

async function updateNoticeDescription(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const noticeId = String(formData.get("notice_id") || "");
  if (!noticeId) throw new Error("Missing notice_id");

  const description = String(formData.get("description") || "");

  const { error } = await supabase
    .from("operations_notices")
    .update({ description })
    .eq("id", noticeId);

  if (error) throw new Error(`Save failed: ${error.message}`);

  revalidatePath(buildNoticeUrl(noticeId));
  redirect(buildNoticeUrl(noticeId, "details", "saved"));
}

async function assignUserAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const noticeId = String(formData.get("notice_id") || "");
  const userId = String(formData.get("user_id") || "");
  const next = String(formData.get("next") || "") || buildNoticeUrl(noticeId, "assignments", "assigned");

  if (!noticeId || !userId) throw new Error("Missing notice_id or user_id");

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("operations_notice_assignments")
    .insert({ notice_id: noticeId, user_id: userId, role: "recipient", assigned_by: user.id });

  if (error && (error as any).code !== "23505") throw new Error(error.message);

  revalidatePath(buildNoticeUrl(noticeId));
  redirect(next);
}

async function revokeAssignmentAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const noticeId = String(formData.get("notice_id") || "");
  const assignmentId = String(formData.get("assignment_id") || "");
  const next = String(formData.get("next") || "") || buildNoticeUrl(noticeId, "assignments", "revoked");
  if (!noticeId || !assignmentId) throw new Error("Missing notice_id or assignment_id");

  const { error } = await supabase.from("operations_notice_assignments").delete().eq("id", assignmentId);
  if (error) throw new Error(error.message);

  revalidatePath(buildNoticeUrl(noticeId));
  redirect(next);
}

async function bulkAssignUsersAction(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();

  const noticeId = String(formData.get("notice_id") || "");
  const userIds = formData.getAll("user_ids").map(id => String(id));
  
  if (!noticeId) throw new Error("Missing notice_id");

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  if (!user) throw new Error("Not authenticated");

  const { data: existingAssignments, error: fetchErr } = await supabase
    .from("operations_notice_assignments")
    .select("id, user_id")
    .eq("notice_id", noticeId);
  
  if (fetchErr) throw new Error(fetchErr.message);
  
  const existingUserIds = new Set((existingAssignments ?? []).map(a => a.user_id));
  
  const toAdd = userIds.filter(id => !existingUserIds.has(id));
  const toRemove = (existingAssignments ?? []).filter(a => !userIds.includes(a.user_id));

  if (toRemove.length > 0) {
    const removeIds = toRemove.map(a => a.id);
    const { error: delErr } = await supabase
      .from("operations_notice_assignments")
      .delete()
      .in("id", removeIds);
    if (delErr) throw new Error(delErr.message);
  }

  if (toAdd.length > 0) {
    const insertRows = toAdd.map(userId => ({
      notice_id: noticeId,
      user_id: userId,
      role: "recipient" as const,
      assigned_by: user.id,
    }));
    
    const { error: insertErr } = await supabase
      .from("operations_notice_assignments")
      .insert(insertRows);
    if (insertErr) throw new Error(insertErr.message);

    // Send notifications to newly assigned users
    const { data: notice } = await supabase
      .from("operations_notices")
      .select("title, require_acknowledgement")
      .eq("id", noticeId)
      .single();

    const { data: assignerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const noticeUrl = toAbsoluteUrl("/app/operations-notices");
    const assignerName = assignerProfile?.full_name || "Admin";

    // Send notification to each newly assigned user (best effort, don't fail on notification errors)
    for (const userId of toAdd) {
      try {
        await notifyUser(userId, "operations_notice_assigned", {
          noticeTitle: notice?.title || "Operations Notice",
          requireAcknowledgement: notice?.require_acknowledgement || false,
          assignedBy: assignerName,
          url: noticeUrl,
        });
      } catch (notifyErr) {
        console.error(`Failed to send notification to user ${userId}:`, notifyErr);
      }
    }
  }

  revalidatePath(buildNoticeUrl(noticeId));
}

type SearchParamsType = {
  notice?: string | string[];
  error?: string | string[];
  tab?: string | string[];
  q?: string | string[];
  [key: string]: string | string[] | undefined;
};

export default async function Page(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParamsType>;
}) {
  const { id } = await props.params;

  if (id === "new") {
    redirect("/app/creator/operations-notices/new");
  }

  const canAccess =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) {
    redirect("/app/home?banner=not_authorised");
  }

  const search: SearchParamsType = (await (props.searchParams ?? Promise.resolve({}))) || {};
  const activeTab = tabKeyFromSearch(search);
  const banner = noticeMessage(
    (Array.isArray(search.notice) ? search.notice[0] : search.notice) || undefined
  );

  const { notice, err } = await loadNotice(id);
  if (err || !notice) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Operations Notice</h1>
        <p className="text-red-600">{err ?? "Not found"}</p>
        <Link href="/app/creator?tab=operations-notices" className="underline">Back</Link>
      </div>
    );
  }

  let allDepartments: string[] = [];
  let responsiblePersons: ResponsiblePerson[] = [];
  if (activeTab === "details") {
    allDepartments = await loadAllDepartments();
    responsiblePersons = await loadResponsiblePersons();
  }

  let assignments: AssignmentRow[] = [];
  let acknowledgedUserIds = new Set<string>();
  let allUsers: ProfileWithDepartment[] = [];
  
  if (activeTab === "assignments") {
    const assignData = await loadAssignments(id);
    assignments = assignData.assignments;
    
    if (notice.require_acknowledgement) {
      acknowledgedUserIds = await loadAcknowledgements(id);
    }
    
    allUsers = await loadAllUsersWithDepartments();
  }

  const tabs: { key: TabKey; href: string }[] = [
    { key: "details", href: buildNoticeUrl(id, "details") },
    { key: "assignments", href: buildNoticeUrl(id, "assignments") },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{notice.title ?? "Untitled Notice"}</h1>
          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium mt-1 ${
            notice.status === "published" ? "bg-green-100 text-green-800" :
            notice.status === "archived" ? "bg-amber-100 text-amber-800" :
            "bg-gray-100 text-gray-800"
          }`}>
            {notice.status}
          </span>
        </div>
        <Link href="/app/creator?tab=operations-notices" className="rounded-md border px-3 py-1 text-sm">
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
        {activeTab === "details" && (
          <DetailsTabClient
            notice={notice}
            allDepartments={allDepartments}
            responsiblePersons={responsiblePersons}
            updateNoticeDetails={updateNoticeDetails}
            updateNoticeDescription={updateNoticeDescription}
            updateNoticeStatusAction={updateNoticeStatusAction}
          />
        )}

        {activeTab === "assignments" && (
          <AssignmentsTab
            noticeId={id}
            notice={notice}
            assignments={assignments}
            acknowledgedUserIds={acknowledgedUserIds}
            allUsers={allUsers}
          />
        )}
      </div>
    </div>
  );
}

function DetailsTab({ notice, allDepartments, responsiblePersons }: { notice: NoticeRow; allDepartments: string[]; responsiblePersons: ResponsiblePerson[] }) {
  const tagsCsv = Array.isArray(notice.tags) ? (notice.tags as string[]).join(", ") : "";
  
  return (
    <div className="space-y-8">
      <form action={updateNoticeDetails} className="space-y-4">
        <input type="hidden" name="notice_id" value={notice.id} />
        <input type="hidden" name="next" value={buildNoticeUrl(notice.id, "details", "saved")} />

        <div className="grid gap-2">
          <label className="text-sm font-medium">Notice Title</label>
          <input 
            name="title" 
            defaultValue={notice.title ?? ""} 
            className="w-full rounded-md border px-3 py-2" 
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Description</label>
          <textarea
            name="description"
            defaultValue={notice.description ?? ""}
            className="w-full rounded-md border px-3 py-2 min-h-[120px]"
            placeholder="Provide details about this operations notice..."
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Department</label>
          <select
            name="department_select"
            defaultValue={notice.department ?? ""}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="">— Select department —</option>
            {allDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Responsible Person</label>
          <select
            name="responsible_person"
            defaultValue={notice.responsible_person ?? ""}
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="">— Select responsible person —</option>
            {responsiblePersons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} ({person.email}) - {person.role}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500">
            Select a senior person or admin who is responsible for this notice.
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Valid for (days)</label>
          <input
            type="number"
            name="valid_for_days"
            min={0}
            defaultValue={notice.valid_for_days == null ? "" : String(notice.valid_for_days)}
            className="w-full rounded-md border px-3 py-2"
            placeholder="e.g. 365 for 1 year, leave empty for no expiry"
          />
          <div className="text-xs text-gray-500">
            Number of days this notice is valid for. Leave empty for no expiry.
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">Tags</label>
          <input
            name="tags_csv"
            defaultValue={tagsCsv}
            placeholder="e.g. safety, update, important"
            className="w-full rounded-md border px-3 py-2"
          />
          <div className="text-xs text-gray-500">Comma-separated, used for filtering.</div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="require_acknowledgement"
              defaultChecked={notice.require_acknowledgement}
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="font-medium text-gray-900">Require Acknowledgement</span>
              <p className="text-sm text-gray-600 mt-0.5">
                When enabled, users assigned to this notice will need to acknowledge they have read it.
              </p>
            </div>
          </label>
        </div>

        <div className="pt-2">
          <button className="rounded-md bg-black px-4 py-2 text-white">Save</button>
        </div>
      </form>

      <hr />

      <div className="space-y-2">
        <h3 className="font-medium">Status</h3>
        <form action={updateNoticeStatusAction} className="flex items-center gap-3">
          <input type="hidden" name="notice_id" value={notice.id} />
          <input type="hidden" name="next" value={buildNoticeUrl(notice.id, "details", "status_updated")} />
          <select
            name="status"
            defaultValue={notice.status}
            className="rounded-md border px-3 py-2"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <button className="rounded-md border px-4 py-2 hover:bg-gray-50">Update Status</button>
        </form>
      </div>
    </div>
  );
}

function AssignmentsTab({
  noticeId,
  notice,
  assignments,
  acknowledgedUserIds,
  allUsers,
}: {
  noticeId: string;
  notice: NoticeRow;
  assignments: AssignmentRow[];
  acknowledgedUserIds: Set<string>;
  allUsers: ProfileWithDepartment[];
}) {
  const assignedUserIds = new Set(assignments.map(a => a.user_id));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium mb-1">Assign Users to this Notice</h3>
        <p className="text-sm text-gray-500 mb-4">
          Select users from the list below. Changes are saved when you click "Save Assignments".
        </p>
      </div>

      <BatchUserAssignment
        users={allUsers}
        assignedUserIds={assignedUserIds}
        acknowledgedUserIds={acknowledgedUserIds}
        requireAcknowledgement={notice.require_acknowledgement}
        noticeId={noticeId}
        bulkAssignAction={bulkAssignUsersAction}
        revokeAction={revokeAssignmentAction}
      />
    </div>
  );
}
