// @ts-nocheck
// @ts-nocheck
// app/app/admin/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import SortableDueDatesTable from "./_components/SortableDueDatesTable";
import SortableUsersTable from "./_components/SortableUsersTable";
import SortableAuthorisationsTable from "./_components/SortableAuthorisationsTable";
import SortableDocumentsTable from "./_components/SortableDocumentsTable";
import SortableCourseProgressTable from "./_components/SortableCourseProgressTable";
import AuthorisationOverviewMatrix from "./_components/AuthorisationOverviewMatrix";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { calculateAuthorizationExpiry } from "@/lib/utils/calculateAuthorizationExpiry";


export const dynamic = "force-dynamic";

type TabKey = "overview" | "due_dates_courses" | "due_dates_authorisations" | "course_progress" | "users" | "pending_authorisations" | "documents" | "sites_jobs" | "audit_trail";

function tabFromSearch(sp: Record<string, string | string[] | undefined>): TabKey {
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab || "";
  if (raw === "overview") return "overview";
  if (raw === "users") return "users";
  if (raw === "due_dates_authorisations") return "due_dates_authorisations";
  if (raw === "course_progress") return "course_progress";
  if (raw === "pending_authorisations") return "pending_authorisations";
  if (raw === "documents") return "documents";
  if (raw === "sites_jobs") return "sites_jobs";
  if (raw === "audit_trail") return "audit_trail";
  return "due_dates_courses";
}

function banner(ok?: string | null, error?: string | null) {
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (ok) {
    const msg =
      ok === "role_granted" ? "Role granted." :
      ok === "role_revoked" ? "Role revoked." :
      ok === "profile_saved" ? "Profile saved." :
      ok === "site_added" ? "Site added." :
      ok === "site_activated" ? "Site activated." :
      ok === "site_deactivated" ? "Site deactivated." :
      ok === "site_renamed" ? "Site updated." :
      ok === "job_added" ? "Job description added." :
      ok === "job_activated" ? "Job description activated." :
      ok === "job_deactivated" ? "Job description deactivated." :
      ok === "job_renamed" ? "Job description updated." :
      "Done.";
    return (
      <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
        {msg}
      </div>
    );
  }
  return null;
}



/* --------------------------
   DUE DATES
---------------------------*/
type CompletedCourseRow = {
  assignment_id: string;
  user_id: string;
  completed_at: string;
  title: string;
  department: string;
  valid_for_days: number;
  retake_reminder_days: number;
  new_due_date: string;
  days_until_expiry: string;
  notification_status: string;
  trainee_email: string;
  trainee_name: string;
};

async function loadCompletedCoursesWithDueDates(q: string | null, page: number = 1) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  // Get all completed course assignments (no pagination yet)
  let assignmentQuery = supabase
    .from("course_assignments")
    .select("id, user_id, course_id, completed_at")
    .eq("assignment_status", "completed")
    .not("completed_at", "is", null);

  const { data: allAssignments, error: assignError } = await assignmentQuery;
  if (assignError) throw new Error(assignError.message);
  if (!allAssignments || allAssignments.length === 0) {
    return { courses: [], totalPages: 0, currentPage: page, totalCount: 0 };
  }

  // Get unique user and course IDs
  const userIds = [...new Set(allAssignments.map(a => a.user_id))];
  const courseIds = [...new Set(allAssignments.map(a => a.course_id))];

  // Get profiles (exclude archived users from active views)
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, archived_at")
    .in("id", userIds);

  if (profileError) throw new Error(profileError.message);

  // Get courses
  const { data: courses, error: courseError } = await supabase
    .from("courses")
    .select("id, title, valid_for_days, created_by, department")
    .in("id", courseIds);

  if (courseError) throw new Error(courseError.message);

  // Create lookup maps (skip archived profiles so their rows are dropped below)
  const profileMap = new Map(
    (profiles || []).filter(p => !p.archived_at).map(p => [p.id, p])
  );
  const courseMap = new Map((courses || []).map(c => [c.id, c]));

  // Transform all data with calculated due dates
  // Drop assignments belonging to archived users
  let completedCourses = allAssignments
    .filter(a => profileMap.has(a.user_id))
    .map((assignment) => {
    const profile = profileMap.get(assignment.user_id);
    const course = courseMap.get(assignment.course_id);

    // Calculate due date
    const completedDate = new Date(assignment.completed_at);
    const validForDays = course?.valid_for_days || 365;
    const dueDate = new Date(completedDate);
    dueDate.setDate(dueDate.getDate() + validForDays);

    // Calculate days until expiry
    const today = new Date();
    const timeDiff = dueDate.getTime() - today.getTime();
    const daysUntilExpiry = Math.ceil(timeDiff / (1000 * 3600 * 24));

    // Determine notification status
    let notificationStatus = "NO NOTIFICATION";
    if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
      notificationStatus = "SHOULD TRIGGER REMINDER";
    } else if (daysUntilExpiry <= 0) {
      notificationStatus = "REMINDER SENT";
    }

    return {
      assignment_id: assignment.id,
      user_id: assignment.user_id,
      completed_at: assignment.completed_at,
      title: course?.title || "Unknown Course",
      department: course?.department || "",
      valid_for_days: validForDays,
      retake_reminder_days: 30,
      new_due_date: dueDate.toISOString(),
      days_until_expiry: daysUntilExpiry.toString(),
      notification_status: notificationStatus,
      trainee_email: profile?.email || "",
      trainee_name: profile?.full_name || "",
    };
  });

  // Apply search filter if provided BEFORE sorting
  if (q && q.trim()) {
    const searchTerm = q.trim().toLowerCase();
    completedCourses = completedCourses.filter(course =>
      (course.trainee_name?.toLowerCase().includes(searchTerm)) ||
      (course.trainee_email?.toLowerCase().includes(searchTerm)) ||
      (course.title?.toLowerCase().includes(searchTerm))
    );
  }

  // Sort ALL filtered records by due date (soonest first)
  completedCourses.sort((a, b) => {
    const dateA = new Date(a.new_due_date).getTime();
    const dateB = new Date(b.new_due_date).getTime();
    return dateA - dateB;
  });

  // Now apply pagination to the sorted results
  const totalCount = completedCourses.length;
  const paginatedCourses = completedCourses.slice(offset, offset + PAGE_SIZE);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return {
    courses: paginatedCourses,
    totalPages,
    currentPage: page,
    totalCount
  };
}

/* --------------------------
   IN-PROGRESS COURSES
---------------------------*/
type InProgressCourseRow = {
  assignment_id: string;
  user_id: string;
  assigned_at: string;
  title: string;
  department?: string;
  assignment_status: string;
  trainee_email?: string;
  trainee_name?: string;
  total_modules: number;
  completed_modules: number;
};

// Fetch rows with .in() filters in chunks — large ID lists otherwise create
// request URLs too long for Supabase and the whole fetch fails
async function fetchInChunks(
  supabase: any,
  table: string,
  select: string,
  column: string,
  ids: string[],
  modify?: (query: any) => any
) {
  const CHUNK_SIZE = 150;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }
  const results = await Promise.all(
    chunks.map(async (chunkIds) => {
      let query = supabase.from(table).select(select).in(column, chunkIds);
      if (modify) query = modify(query);
      const { data, error } = await query;
      if (error) throw new Error(`${table}: ${error.message}`);
      return data || [];
    })
  );
  return results.flat();
}

async function loadInProgressCourses(q: string | null) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  // Get course assignments that are not completed (only trainee role to avoid duplicates)
  // Note: No limit here so search can find all assignments
  const { data: assignments, error: assignError } = await supabase
    .from("course_assignments")
    .select("id, user_id, course_id, assignment_status, created_at")
    .in("assignment_status", ["assigned", "in_progress"])
    .eq("role", "trainee")
    .order("created_at", { ascending: false });

  if (assignError) throw new Error(assignError.message);
  if (!assignments || assignments.length === 0) return [];

  // Get unique user and course IDs
  const userIds = [...new Set(assignments.map(a => a.user_id))];
  const courseIds = [...new Set(assignments.map(a => a.course_id))];
  const assignmentIds = assignments.map(a => a.id);

  // Fetch related data in chunks (large ID lists break single requests)
  const [profiles, courses, courseModules, progress] = await Promise.all([
    fetchInChunks(supabase, "profiles", "id, full_name, email, archived_at", "id", userIds),
    fetchInChunks(supabase, "courses", "id, title, department", "id", courseIds),
    fetchInChunks(supabase, "course_modules", "id, course_id", "course_id", courseIds),
    fetchInChunks(
      supabase,
      "assignment_progress",
      "assignment_id, module_id, completed_at",
      "assignment_id",
      assignmentIds,
      (query) => query.not("completed_at", "is", null)
    ),
  ]);

  // Create lookup maps (skip archived profiles so their assignments are dropped below)
  const profileMap = new Map(
    (profiles || []).filter(p => !p.archived_at).map(p => [p.id, p])
  );
  const courseMap = new Map((courses || []).map(c => [c.id, c]));

  // Count modules per course
  const moduleCounts = new Map();
  (courseModules || []).forEach(module => {
    const count = moduleCounts.get(module.course_id) || 0;
    moduleCounts.set(module.course_id, count + 1);
  });

  // Count completed modules per assignment
  const completedCounts = new Map();
  (progress || []).forEach(p => {
    const count = completedCounts.get(p.assignment_id) || 0;
    completedCounts.set(p.assignment_id, count + 1);
  });

  // Transform data (drop assignments belonging to archived users)
  let inProgressCourses = assignments
    .filter(a => profileMap.has(a.user_id))
    .map((assignment) => {
    const profile = profileMap.get(assignment.user_id);
    const course = courseMap.get(assignment.course_id);
    const totalModules = moduleCounts.get(assignment.course_id) || 0;
    const completedModules = completedCounts.get(assignment.id) || 0;

    return {
      assignment_id: assignment.id,
      user_id: assignment.user_id,
      assigned_at: assignment.created_at,
      title: course?.title || "Unknown Course",
      department: course?.department || "",
      assignment_status: assignment.assignment_status,
      trainee_email: profile?.email || "",
      trainee_name: profile?.full_name || "",
      total_modules: totalModules,
      completed_modules: completedModules,
    };
  });

  // Apply search filter if provided
  if (q && q.trim()) {
    const searchTerm = q.trim().toLowerCase();
    inProgressCourses = inProgressCourses.filter(course =>
      (course.trainee_name?.toLowerCase().includes(searchTerm)) ||
      (course.trainee_email?.toLowerCase().includes(searchTerm)) ||
      (course.title?.toLowerCase().includes(searchTerm)) ||
      (course.department?.toLowerCase().includes(searchTerm))
    );
  }

  // Apply a reasonable limit after filtering to prevent performance issues
  // This ensures search works across all data but we don't return too many results
  const MAX_DISPLAY_RESULTS = 200;
  if (inProgressCourses.length > MAX_DISPLAY_RESULTS) {
    inProgressCourses = inProgressCourses.slice(0, MAX_DISPLAY_RESULTS);
  }

  return inProgressCourses;
}

/* --------------------------
   USERS + ROLES
---------------------------*/
type Profile = { id: string; full_name: string | null; email: string | null; site_id?: string | null; site_name?: string | null; job_description?: string | null };
type RoleCatalogItem = { id: string; name: string; description?: string | null };

async function loadRoleCatalog() {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, description")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  const items = (data ?? []).map(r => ({ id: r.id as string, name: r.name as string, description: (r as any).description ?? null }));
  return items as RoleCatalogItem[];
}

async function loadUsersAndRoles(q: string | null, page: number = 1) {
  "use server";
  noStore();
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home?banner=no_access");
  
  const supabase = supabaseAdmin();

  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  // First get total count
  let countQuery = supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .is("archived_at", null);

  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    countQuery = countQuery.or(`full_name.ilike.${like},email.ilike.${like}`);
  }

  const { count: totalCount } = await countQuery;

  // Get all sites for lookup
  const { data: allSites } = await supabase
    .from("sites")
    .select("id, name");
  const siteMap = new Map((allSites || []).map(s => [s.id, s.name]));

  // Profiles (exclude archived users) with pagination
  let profs: Profile[] = [];
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, site_id, job_description")
      .or(`full_name.ilike.${like},email.ilike.${like}`)
      .is("archived_at", null)
      .order("full_name", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    profs = (data ?? []).map((p: any) => ({
      ...p,
      site_name: p.site_id ? siteMap.get(p.site_id) || null : null
    })) as Profile[];
  } else {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, site_id, job_description")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    profs = (data ?? []).map((p: any) => ({
      ...p,
      site_name: p.site_id ? siteMap.get(p.site_id) || null : null
    })) as Profile[];
  }

  // Role catalog + user_roles
  const catalog = await loadRoleCatalog();
  const ids = profs.map(p => p.id);

  const roleIdToName = new Map<string, string>();
  catalog.forEach(r => roleIdToName.set(r.id, r.name));

  const { data: ur, error: urErr } = await supabase
    .from("user_roles")
    .select("user_id, role_id")
    .in("user_id", ids);
  if (urErr) throw new Error(urErr.message);

  const roleMap = new Map<string, string[]>();
  (ur ?? []).forEach((row: any) => {
    const rn = roleIdToName.get(row.role_id) ?? `(unknown: ${row.role_id})`;
    const list = roleMap.get(row.user_id) ?? [];
    if (!list.includes(rn)) list.push(rn);
    roleMap.set(row.user_id, list);
  });

  // Offer curated set if present; otherwise fall back to all roles
  const preferred = ["Admin", "Trainers and Assessors", "Course Creators", "Senior Management"];
  const namesInCatalog = new Set(catalog.map(c => c.name));
  const offeredNames = preferred.filter(n => namesInCatalog.has(n));
  const grantablePool = offeredNames.length ? offeredNames : Array.from(namesInCatalog);

  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);

  return { 
    profiles: profs, 
    roleMap, 
    grantablePool, 
    totalPages, 
    currentPage: page, 
    totalCount: totalCount || 0 
  };
}

/* --------------------------
   DOCUMENTS
---------------------------*/
type DocumentRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  document_name: string;
  file_type: string;
  upload_date: string;
  expires_on: string | null;
  status: string;
  course_title: string | null;
  module_title: string | null;
};

async function loadUserDocuments(q: string | null, page: number = 1) {
  "use server";
  noStore();
  // Check authorization with regular client
  const regularSupabase = await createSupabaseServer();
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");
  
  // Use admin client for fetching ALL documents from all users
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = supabaseAdmin();

  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  // Get archived user IDs so their documents are excluded from active views
  const { data: archivedProfiles } = await supabase
    .from("profiles")
    .select("id")
    .not("archived_at", "is", null);
  const archivedUserIds = (archivedProfiles || []).map(p => p.id);

  // First get total count (excluding archived users)
  let countQuery = supabase
    .from("learner_documents")
    .select("*", { count: "exact", head: true })
    .or("status.is.null,status.neq.replaced");
  if (archivedUserIds.length > 0) {
    countQuery = countQuery.not("user_id", "in", `(${archivedUserIds.join(",")})`);
  }
  const { count: totalCount } = await countQuery;

  // Fetch documents with pagination (excluding archived users)
  // Order by expires_on to show expired and expiring soon documents first
  let docQuery = supabase
    .from("learner_documents")
    .select(`
      id,
      user_id,
      title,
      file_path,
      file_type,
      file_size,
      expires_on,
      status,
      created_at,
      course_id,
      module_id
    `)
    .or("status.is.null,status.neq.replaced")
    .order("expires_on", { ascending: true, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (archivedUserIds.length > 0) {
    docQuery = docQuery.not("user_id", "in", `(${archivedUserIds.join(",")})`);
  }
  const { data: documents, error: documentsError } = await docQuery;

  if (documentsError) throw new Error(documentsError.message);
  if (!documents || documents.length === 0) return { documents: [], totalPages: 0, currentPage: page, totalCount: totalCount || 0 };

  console.log(`Found ${documents.length} documents in database`);

  // Get unique user IDs, course IDs, and module IDs
  const userIds = [...new Set(documents.map(d => d.user_id))];
  const courseIds = [...new Set(documents.map(d => d.course_id).filter(Boolean))];
  const moduleIds = [...new Set(documents.map(d => d.module_id).filter(Boolean))];

  // Fetch profiles separately (exclude archived users from active views)
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email, archived_at")
    .in("id", userIds);

  if (profilesError) throw new Error(profilesError.message);

  // Fetch courses separately
  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, title")
    .in("id", courseIds);

  if (coursesError) throw new Error(coursesError.message);

  // Fetch modules separately
  const { data: modules, error: modulesError } = await supabase
    .from("course_modules")
    .select("id, title")
    .in("id", moduleIds);

  if (modulesError) throw new Error(modulesError.message);

  // Create lookup maps (skip archived profiles so their docs are filtered out below)
  const profileMap = new Map(
    (profiles || []).filter(p => !p.archived_at).map(p => [p.id, p])
  );
  const courseMap = new Map((courses || []).map(c => [c.id, c]));
  const moduleMap = new Map((modules || []).map(m => [m.id, m]));

  // Combine the data
  let formattedDocuments: DocumentRow[] = documents.map((doc: any) => {
    const profile = profileMap.get(doc.user_id);
    const course = courseMap.get(doc.course_id);
    const module = moduleMap.get(doc.module_id);

    return {
      id: doc.id,
      user_id: doc.user_id,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      document_name: doc.title || doc.file_path?.split('/').pop() || 'Unknown Document',
      file_type: doc.file_type || 'unknown',
      upload_date: doc.created_at,
      expires_on: doc.expires_on,
      status: doc.status || 'active',
      course_title: course?.title ?? null,
      module_title: module?.title ?? null,
    };
  });

  // Apply search filter if provided
  if (q && q.trim()) {
    const searchTerm = q.trim().toLowerCase();
    const beforeFilter = formattedDocuments.length;
    formattedDocuments = formattedDocuments.filter(doc =>
      (doc.full_name?.toLowerCase().includes(searchTerm) ?? false) ||
      (doc.email?.toLowerCase().includes(searchTerm) ?? false) ||
      (doc.document_name?.toLowerCase().includes(searchTerm) ?? false) ||
      (doc.course_title?.toLowerCase().includes(searchTerm) ?? false) ||
      (doc.module_title?.toLowerCase().includes(searchTerm) ?? false)
    );
    console.log(`Filtered documents from ${beforeFilter} to ${formattedDocuments.length} for search term: "${q}"`);
  }

  const totalPages = Math.ceil((totalCount || 0) / PAGE_SIZE);
  
  console.log(`Returning ${formattedDocuments.length} documents total (page ${page} of ${totalPages})`);
  return { 
    documents: formattedDocuments, 
    totalPages, 
    currentPage: page, 
    totalCount: totalCount || 0 
  };
}


/* --------------------------
   PAGE
---------------------------*/
export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  // Check if user has Authorization Approver role for pending_authorisations tab
  const isAuthorizationApprover = await hasRole("Authorization Approver");

  // Sites & Jobs management is Admin-only
  const isAdmin = await hasRole("Admin");

  const resolvedSearchParams = await searchParams;
  const tab = tabFromSearch(resolvedSearchParams ?? {});
  const ok =
    (Array.isArray(resolvedSearchParams?.ok) ? resolvedSearchParams?.ok[0] : resolvedSearchParams?.ok) ?? null;
  const error =
    (Array.isArray(resolvedSearchParams?.error) ? resolvedSearchParams?.error[0] : resolvedSearchParams?.error) ?? null;

  const q =
    (Array.isArray(resolvedSearchParams?.q) ? resolvedSearchParams?.q[0] : resolvedSearchParams?.q) ?? null;

  const page = 
    parseInt((Array.isArray(resolvedSearchParams?.page) ? resolvedSearchParams?.page[0] : resolvedSearchParams?.page) ?? "1");

  const tabs: { key: TabKey; label: string; href: string }[] = [
    { key: "overview", label: "Overview", href: "/app/admin?tab=overview" },
    { key: "due_dates_courses", label: "Due Dates - Courses", href: "/app/admin?tab=due_dates_courses" },
    { key: "due_dates_authorisations", label: "Due Dates - Authorisations", href: "/app/admin?tab=due_dates_authorisations" },
    { key: "course_progress", label: "Course Progress", href: "/app/admin?tab=course_progress" },
    { key: "documents", label: "Due Dates - Documents", href: "/app/admin?tab=documents" },
    { key: "users", label: "Users & Roles", href: "/app/admin?tab=users" },
  ];

  // Audit Trail is Admin-only
  if (isAdmin) {
    tabs.push({ key: "audit_trail", label: "Audit Trail", href: "/app/admin?tab=audit_trail" });
  }

  // Only show the Sites & Jobs management tab to Admins
  if (isAdmin) {
    tabs.push({ key: "sites_jobs", label: "Sites & Jobs", href: "/app/admin?tab=sites_jobs" });
  }

  // Only add pending_authorisations tab if user has Authorization Approver role
  if (isAuthorizationApprover) {
    tabs.push({ key: "pending_authorisations", label: "Pending Authorisations", href: "/app/admin?tab=pending_authorisations" });
  }

  // Fetch necessary data based on the active tab
  let documents: DocumentRow[] = [];
  let pendingAssignments: any[] = []; // Placeholder, replace with actual type if available
  let profiles: Profile[] = [];
  let roleMap: Map<string, string[]> = new Map();
  let grantablePool: string[] = [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex gap-2">
          <Link
            href="/app/admin/diagnose-documents"
            className="rounded-md bg-purple-600 text-white px-3 py-1 text-sm hover:bg-purple-700"
          >
            Document Diagnostics
          </Link>
          <Link
            href="/app/admin/diagnose-authorizations"
            className="rounded-md bg-indigo-600 text-white px-3 py-1 text-sm hover:bg-indigo-700"
          >
            Authorization Diagnostics
          </Link>
          {isAdmin && (
            <Link
              href="/app/admin/connections"
              className="rounded-md bg-amber-600 text-white px-3 py-1 text-sm hover:bg-amber-700"
            >
              Connection Map
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/app/admin/tools/document-sweep"
              className="rounded-md bg-rose-600 text-white px-3 py-1 text-sm hover:bg-rose-700"
            >
              Stranded Upload Cleanup
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/app/admin/tools/unpublished-assignments"
              className="rounded-md bg-amber-500 text-white px-3 py-1 text-sm hover:bg-amber-600"
            >
              Unpublished Course Assignments
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/app/admin/tools/video-compression"
              className="rounded-md bg-teal-600 text-white px-3 py-1 text-sm hover:bg-teal-700"
            >
              Video Optimisation Queue
            </Link>
          )}
          <Link
            href="/app/admin/teams-link-test"
            className="rounded-md bg-blue-600 text-white px-3 py-1 text-sm hover:bg-blue-700"
          >
            Teams Link Test
          </Link>
        </div>
      </div>

      {banner(ok, error)}

      <div className="flex gap-2">
        {tabs.map(t => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={[
                "rounded-md px-3 py-1 text-sm",
                active ? "bg-black text-white" : "border hover:bg-gray-50",
              ].join(" ")}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border bg-white p-4">
        {tab === "overview" ? (
          <OverviewSection />
        ) : tab === "due_dates_courses" ? (
          <DueDatesCourseSection q={q} page={page} />
        ) : tab === "due_dates_authorisations" ? (
          <DueDatesAuthorisationSection q={q} page={page} />
        ) : tab === "course_progress" ? (
          <CourseProgressSection q={q} />
        ) : tab === "documents" ? (
          <DocumentsSection q={q} page={page} />
        ) : tab === "users" ? (
          <UsersSection q={q} page={page} />
        ) : tab === "sites_jobs" ? (
          <SitesAndJobsSection />
        ) : tab === "audit_trail" ? (
          isAdmin ? (
            <AuditTrailSection q={q} page={page} />
          ) : (
            <p className="text-sm text-red-600">Admin access required.</p>
          )
        ) : (
          <PendingAuthorisationsSection q={q} />
        )}
      </div>
    </div>
  );
}

/* --------------------------
   SUBSECTIONS
---------------------------*/

async function loadAuthorisationOverview() {
  "use server";
  noStore();
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  const supabase = supabaseAdmin();

  // Sites lookup
  const { data: allSites } = await supabase.from("sites").select("id, name");
  const siteMap = new Map((allSites || []).map((s: any) => [s.id, s.name]));

  // Active (non-archived) users
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, site_id")
    .is("archived_at", null)
    .order("full_name", { ascending: true });
  if (profErr) throw new Error(profErr.message);

  const users = (profiles || []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    site_name: p.site_id ? siteMap.get(p.site_id) || null : null,
  }));

  // All authorisations
  const { data: auths, error: authErr } = await supabase
    .from("authorisations")
    .select("id, title, department, valid_for_days")
    .order("title", { ascending: true });
  if (authErr) throw new Error(authErr.message);

  const authList = (auths || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    department: a.department ?? null,
  }));

  // Completed authorisation assignments
  const { data: assignments, error: asnErr } = await supabase
    .from("authorisation_assignments")
    .select("id, user_id, authorisation_id, approved_at")
    .eq("assignment_status", "completed")
    .not("approved_at", "is", null);
  if (asnErr) throw new Error(asnErr.message);

  const userIdSet = new Set(users.map((u) => u.id));
  const authValidityMap = new Map<string, number | null>(
    (auths || []).map((a: any) => [a.id, a.valid_for_days ?? null])
  );

  const filteredAssignments = (assignments || []).filter(
    (a: any) => userIdSet.has(a.user_id) && authValidityMap.has(a.authorisation_id)
  );

  const authIds = [...new Set(filteredAssignments.map((a: any) => a.authorisation_id))];
  const userIds = [...new Set(filteredAssignments.map((a: any) => a.user_id))];

  // Auth -> courses mapping
  const { data: authCourses } = authIds.length
    ? await supabase
        .from("authorisation_courses")
        .select("authorisation_id, course_id")
        .in("authorisation_id", authIds)
    : { data: [] as any[] };

  const authCourseMap = new Map<string, string[]>();
  (authCourses || []).forEach((ac: any) => {
    const list = authCourseMap.get(ac.authorisation_id) || [];
    list.push(ac.course_id);
    authCourseMap.set(ac.authorisation_id, list);
  });

  const allCourseIds = [
    ...new Set((authCourses || []).map((ac: any) => ac.course_id)),
  ];

  // Course validity
  const { data: courseRows } = allCourseIds.length
    ? await supabase
        .from("courses")
        .select("id, valid_for_months")
        .in("id", allCourseIds)
    : { data: [] as any[] };
  const courseValidityMap = new Map<string, number | null>(
    (courseRows || []).map((c: any) => [c.id, c.valid_for_months ?? null])
  );

  // Documents with expiry (for users x courses)
  let documents: any[] = [];
  if (allCourseIds.length && userIds.length) {
    const { data: docs } = await supabase
      .from("learner_documents")
      .select("user_id, course_id, expires_on")
      .in("user_id", userIds)
      .in("course_id", allCourseIds)
      .not("expires_on", "is", null)
      .or("status.is.null,status.neq.replaced");
    documents = docs || [];
  }
  const userCourseDocMap = new Map<string, any[]>();
  documents.forEach((d: any) => {
    const k = `${d.user_id}_${d.course_id}`;
    const arr = userCourseDocMap.get(k) || [];
    arr.push(d);
    userCourseDocMap.set(k, arr);
  });

  // Course assignments (for course-based expiry)
  let courseAssignments: any[] = [];
  if (allCourseIds.length && userIds.length) {
    const { data: ca } = await supabase
      .from("course_assignments")
      .select("user_id, course_id, completed_at")
      .in("user_id", userIds)
      .in("course_id", allCourseIds)
      .eq("role", "trainee")
      .not("completed_at", "is", null);
    courseAssignments = ca || [];
  }
  const userCourseAsnMap = new Map<string, any>();
  courseAssignments.forEach((ca: any) => {
    userCourseAsnMap.set(`${ca.user_id}_${ca.course_id}`, ca);
  });

  // For each (user, auth), keep latest approval; compute expiry
  const completions: Record<string, Record<string, { approved_at: string; expires_at: string | null }>> = {};

  filteredAssignments.forEach((asn: any) => {
    const userId = asn.user_id;
    const authId = asn.authorisation_id;
    const approvedAt = asn.approved_at as string;

    const existing = completions[userId]?.[authId];
    if (existing && new Date(existing.approved_at) >= new Date(approvedAt)) {
      return; // keep newer
    }

    const courseIds = authCourseMap.get(authId) || [];
    const userDocs: any[] = [];
    const userCourses: any[] = [];
    courseIds.forEach((cid) => {
      const k = `${userId}_${cid}`;
      const docs = userCourseDocMap.get(k) || [];
      userDocs.push(...docs);
      const validForMonths = courseValidityMap.get(cid);
      const courseAsn = userCourseAsnMap.get(k);
      if (validForMonths && courseAsn?.completed_at) {
        userCourses.push({ valid_for_months: validForMonths, completed_at: courseAsn.completed_at });
      }
    });

    const expiry = calculateAuthorizationExpiry(
      new Date(approvedAt),
      authValidityMap.get(authId) ?? null,
      userDocs.map((d) => ({ expires_on: d.expires_on })),
      userCourses
    );

    if (!completions[userId]) completions[userId] = {};
    completions[userId][authId] = {
      approved_at: approvedAt,
      expires_at: expiry ? expiry.toISOString() : null,
    };
  });

  // Retake in progress: the user's prior (still in-date) authorisation lives
  // only in authorisation_assignment_history (reason='retake'). It remains
  // CURRENT until the retake is approved or the snapshot's expires_at passes,
  // so the overview matrix must show it instead of "never completed".
  try {
    const nowIso = new Date().toISOString();
    const { data: snaps } = await supabase
      .from("authorisation_assignment_history")
      .select("assignment_id, user_id, authorisation_id, approved_at, completed_at, expires_at, superseded_at")
      .eq("reason", "retake")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("superseded_at", { ascending: false })
      .limit(1000);

    // Latest snapshot per live assignment (rows are reused across retakes).
    const latestSnap = new Map<string, any>();
    for (const s of snaps || []) {
      if (s.assignment_id && !latestSnap.has(s.assignment_id)) latestSnap.set(s.assignment_id, s);
    }

    const snapIds = [...latestSnap.keys()];
    const liveRows: any[] = [];
    for (let i = 0; i < snapIds.length; i += 150) {
      const { data: chunk } = await supabase
        .from("authorisation_assignments")
        .select("id, assignment_status, approved_at")
        .in("id", snapIds.slice(i, i + 150));
      liveRows.push(...(chunk || []));
    }
    const liveById = new Map(liveRows.map((r: any) => [r.id, r]));

    const now = new Date();
    for (const [asnId, snap] of latestSnap) {
      const live = liveById.get(asnId);
      if (!live) continue;
      // Only assignments still going through a retake qualify.
      if (["completed", "revoked", "expired"].includes(live.assignment_status)) continue;
      // Stale snapshot: retake already re-approved since it was taken.
      if (live.approved_at && new Date(live.approved_at) > new Date(snap.superseded_at)) continue;
      // Prior authorisation only stays current until its own expiry.
      if (snap.expires_at && new Date(snap.expires_at) < now) continue;
      if (!userIdSet.has(snap.user_id) || !authValidityMap.has(snap.authorisation_id)) continue;
      // Don't overwrite a genuine live completion.
      if (completions[snap.user_id]?.[snap.authorisation_id]) continue;

      if (!completions[snap.user_id]) completions[snap.user_id] = {};
      completions[snap.user_id][snap.authorisation_id] = {
        approved_at: snap.approved_at || snap.completed_at,
        expires_at: snap.expires_at || null,
      };
    }
  } catch (e) {
    console.error("Could not load retake-pending prior authorisations for overview:", e);
  }

  return { users, authorisations: authList, completions };
}

async function OverviewSection() {
  const { users, authorisations, completions } = await loadAuthorisationOverview();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Authorisation Overview</h2>
        <p className="text-sm text-gray-600">
          Pick the staff and authorisations you want to see, then generate a matrix of completions and expiry dates.
        </p>
      </div>
      <AuthorisationOverviewMatrix
        users={users}
        authorisations={authorisations}
        completions={completions}
      />
    </div>
  );
}

/* --------------------------
   SITES & JOB DESCRIPTIONS
---------------------------*/
type ManagedItem = { id: string; name: string; active: boolean };

async function loadSitesAndJobs() {
  "use server";
  noStore();
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home?banner=no_access");

  const supabase = supabaseAdmin();

  const { data: sites, error: sitesErr } = await supabase
    .from("sites")
    .select("id, name, active")
    .order("name", { ascending: true });
  if (sitesErr) throw new Error(sitesErr.message);

  const { data: jobs, error: jobsErr } = await supabase
    .from("job_descriptions")
    .select("id, name, active")
    .order("name", { ascending: true });
  if (jobsErr) throw new Error(jobsErr.message);

  return {
    sites: (sites || []) as ManagedItem[],
    jobs: (jobs || []) as ManagedItem[],
  };
}

function ManagedListCard({
  title,
  description,
  items,
  createAction,
  toggleAction,
  renameAction,
  inputPlaceholder,
}: {
  title: string;
  description: string;
  items: ManagedItem[];
  createAction: string;
  toggleAction: string;
  renameAction: string;
  inputPlaceholder: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-600">{description}</p>
      </div>

      <form action={createAction} method="post" className="flex items-center gap-2">
        <input
          name="name"
          required
          placeholder={inputPlaceholder}
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-gray-800">
          Add
        </button>
      </form>

      <div className="divide-y rounded-md border">
        {items.length === 0 ? (
          <div className="px-3 py-3 text-sm text-gray-500">Nothing here yet.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2">
              <form action={renameAction} method="post" className="flex flex-1 items-center gap-2">
                <input type="hidden" name="id" value={item.id} />
                <input
                  name="name"
                  defaultValue={item.name}
                  required
                  className="flex-1 rounded-md border px-2 py-1 text-sm"
                />
                {!item.active && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    Inactive
                  </span>
                )}
                <button className="rounded-md border px-2 py-1 text-xs text-blue-700 border-blue-300 hover:bg-blue-50">
                  Save
                </button>
              </form>
              <form action={toggleAction} method="post">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="active" value={String(item.active)} />
                <button
                  className={[
                    "rounded-md border px-2 py-1 text-xs",
                    item.active
                      ? "text-amber-700 border-amber-300 hover:bg-amber-50"
                      : "text-green-700 border-green-300 hover:bg-green-50",
                  ].join(" ")}
                >
                  {item.active ? "Deactivate" : "Activate"}
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

async function SitesAndJobsSection() {
  const { sites, jobs } = await loadSitesAndJobs();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Sites &amp; Job Descriptions</h2>
        <p className="text-sm text-gray-600">
          Manage the sites and job descriptions that can be assigned to users. Only active
          entries appear in the user edit dropdowns.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ManagedListCard
          title="Sites"
          description={`${sites.length} total`}
          items={sites}
          createAction="/app/admin/sites/create"
          toggleAction="/app/admin/sites/toggle"
          renameAction="/app/admin/sites/rename"
          inputPlaceholder="New site name"
        />
        <ManagedListCard
          title="Job Descriptions"
          description={`${jobs.length} total`}
          items={jobs}
          createAction="/app/admin/job-descriptions/create"
          toggleAction="/app/admin/job-descriptions/toggle"
          renameAction="/app/admin/job-descriptions/rename"
          inputPlaceholder="New job description"
        />
      </div>
    </div>
  );
}

async function DueDatesCourseSection({ q, page = 1 }: { q: string | null; page?: number }) {
  const result = await loadCompletedCoursesWithDueDates(q, page);
  const { courses: completedCourses, totalPages, currentPage, totalCount } = result;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Course Due Dates</h2>
          <span className="text-sm text-gray-600">
            {totalCount} total courses (sorted by due date)
          </span>
        </div>
        <form method="get" action="/app/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="due_dates_courses" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search trainee, course, or email"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
        </form>
      </div>

      <SortableDueDatesTable completedCourses={completedCourses} />
      
      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-1 justify-between sm:hidden">
            {currentPage > 1 && (
              <a
                href={`/app/admin?tab=due_dates_courses&page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Previous
              </a>
            )}
            {currentPage < totalPages && (
              <a
                href={`/app/admin?tab=due_dates_courses&page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Next
              </a>
            )}
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{((currentPage - 1) * 50) + 1}</span> to{' '}
                <span className="font-medium">{Math.min(currentPage * 50, totalCount)}</span> of{' '}
                <span className="font-medium">{totalCount}</span> results
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                {currentPage > 1 && (
                  <a
                    href={`/app/admin?tab=due_dates_courses&page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                    </svg>
                  </a>
                )}
                
                {/* Page numbers */}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const pageNum = i + 1;
                  const isCurrentPage = pageNum === currentPage;
                  return (
                    <a
                      key={pageNum}
                      href={`/app/admin?tab=due_dates_courses&page=${pageNum}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                        isCurrentPage
                          ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                          : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                      }`}
                    >
                      {pageNum}
                    </a>
                  );
                })}
                
                {currentPage < totalPages && (
                  <a
                    href={`/app/admin?tab=due_dates_courses&page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                  </a>
                )}
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function DueDatesAuthorisationSection({ q, page = 1 }: { q: string | null; page?: number }) {
  const result = await loadCompletedAuthorisationsWithDueDates(q, page);
  const { authorisations: completedAuthorisations, totalPages, currentPage, totalCount } = result;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Authorisation Due Dates</h2>
          <span className="text-sm text-gray-600">
            {totalCount} total authorisations (sorted by expiry date)
          </span>
        </div>
        <form method="get" action="/app/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="due_dates_authorisations" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search trainee, authorisation, or email"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
        </form>
      </div>

      <SortableAuthorisationsTable completedAuthorisations={completedAuthorisations} />
      
      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-1 justify-between sm:hidden">
            {currentPage > 1 && (
              <a
                href={`/app/admin?tab=due_dates_authorisations&page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Previous
              </a>
            )}
            {currentPage < totalPages && (
              <a
                href={`/app/admin?tab=due_dates_authorisations&page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Next
              </a>
            )}
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{((currentPage - 1) * 50) + 1}</span> to{' '}
                <span className="font-medium">{Math.min(currentPage * 50, totalCount)}</span> of{' '}
                <span className="font-medium">{totalCount}</span> results
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                {currentPage > 1 && (
                  <a
                    href={`/app/admin?tab=due_dates_authorisations&page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                    </svg>
                  </a>
                )}
                
                {/* Page numbers */}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const pageNum = i + 1;
                  const isCurrentPage = pageNum === currentPage;
                  return (
                    <a
                      key={pageNum}
                      href={`/app/admin?tab=due_dates_authorisations&page=${pageNum}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                        isCurrentPage
                          ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                          : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                      }`}
                    >
                      {pageNum}
                    </a>
                  );
                })}
                
                {currentPage < totalPages && (
                  <a
                    href={`/app/admin?tab=due_dates_authorisations&page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                  </a>
                )}
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function CourseProgressSection({ q }: { q: string | null }) {
  const inProgressCourses = await loadInProgressCourses(q);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Course Progress</h2>
        <form method="get" action="/app/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="course_progress" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search trainee, course, or email"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
        </form>
      </div>

      <SortableCourseProgressTable inProgressCourses={inProgressCourses} />
    </div>
  );
}

async function loadCompletedAuthorisationsWithDueDates(q: string | null, page: number = 1) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const allowed = (await hasRole("Admin")) || (await hasRole("Trainers and Assessors"));
  if (!allowed) redirect("/app/home?banner=no_access");

  const PAGE_SIZE = 50;
  const offset = (page - 1) * PAGE_SIZE;

  // Get ALL authorisation assignments (no pagination yet) to properly sort
  const { data: allAssignments, error: assignError } = await supabase
    .from("authorisation_assignments")
    .select("id, user_id, authorisation_id, approved_at")
    .eq("assignment_status", "completed")
    .not("approved_at", "is", null);

  if (assignError) throw new Error(assignError.message);

  // NOTE: no early return when there are no live completed assignments —
  // superseded history rows (retake in progress) must still be shown below.
  const liveAssignments = allAssignments || [];

  // Get unique authorisation IDs and user IDs
  const authIds = [...new Set(liveAssignments.map(a => a.authorisation_id))];
  const userIds = [...new Set(liveAssignments.map(a => a.user_id))];

  // Get authorisations
  const { data: authorisations, error: authError } = await supabase
    .from("authorisations")
    .select("id, title, valid_for_days, department")
    .in("id", authIds);

  if (authError) throw new Error(authError.message);

  // Get profiles (exclude archived users from active views)
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, archived_at")
    .in("id", userIds);

  if (profileError) throw new Error(profileError.message);

  // Create lookup maps (skip archived profiles so their authorisations are dropped)
  const authMap = new Map((authorisations || []).map(a => [a.id, a]));
  const profileMap = new Map(
    (profiles || []).filter(p => !p.archived_at).map(p => [p.id, p])
  );

  // Use admin client to bypass RLS for document and course queries
  const adminClient = supabaseAdmin();

  // Get authorisation-course mappings
  const { data: authCourses } = await adminClient
    .from("authorisation_courses")
    .select("authorisation_id, course_id")
    .in("authorisation_id", authIds);

  const authCourseMap = new Map<string, string[]>();
  (authCourses || []).forEach((ac: any) => {
    const existing = authCourseMap.get(ac.authorisation_id) || [];
    existing.push(ac.course_id);
    authCourseMap.set(ac.authorisation_id, existing);
  });

  const allCourseIds = [...new Set((authCourses || []).map((ac: any) => ac.course_id))];

  // Get documents with expiry dates
  let documents: any[] = [];
  if (allCourseIds.length > 0 && userIds.length > 0) {
    const { data: docs } = await adminClient
      .from("learner_documents")
      .select("id, user_id, course_id, expires_on")
      .in("user_id", userIds)
      .in("course_id", allCourseIds)
      .not("expires_on", "is", null)
      .or("status.is.null,status.neq.replaced");
    documents = docs || [];
  }

  const userCourseDocMap = new Map<string, any[]>();
  documents.forEach((doc: any) => {
    const key = `${doc.user_id}_${doc.course_id}`;
    const existing = userCourseDocMap.get(key) || [];
    existing.push(doc);
    userCourseDocMap.set(key, existing);
  });

  // Get courses with validity
  const { data: courses } = await adminClient
    .from("courses")
    .select("id, valid_for_months")
    .in("id", allCourseIds.length > 0 ? allCourseIds : ["none"]);

  const courseValidityMap = new Map<string, number | null>();
  (courses || []).forEach((c: any) => {
    courseValidityMap.set(c.id, c.valid_for_months);
  });

  // Get course assignments
  let courseAssignments: any[] = [];
  if (allCourseIds.length > 0 && userIds.length > 0) {
    const { data: assignments } = await adminClient
      .from("course_assignments")
      .select("id, user_id, course_id, completed_at")
      .in("user_id", userIds)
      .in("course_id", allCourseIds)
      .eq("role", "trainee")
      .not("completed_at", "is", null);
    courseAssignments = assignments || [];
  }

  const userCourseAssignmentMap = new Map<string, any>();
  courseAssignments.forEach((ca: any) => {
    const key = `${ca.user_id}_${ca.course_id}`;
    userCourseAssignmentMap.set(key, ca);
  });

  // Transform all data with calculated expiry dates
  // Drop assignments belonging to archived users
  let completedAuthorisations = liveAssignments
    .filter(a => profileMap.has(a.user_id))
    .map(assignment => {
    const auth = authMap.get(assignment.authorisation_id);
    const profile = profileMap.get(assignment.user_id);
    const completedAt = new Date(assignment.approved_at);
    const validForDays = auth?.valid_for_days ?? null;

    // Get courses linked to this authorization
    const courseIds = authCourseMap.get(assignment.authorisation_id) || [];
    const userDocs: any[] = [];
    const userCourses: any[] = [];

    courseIds.forEach(courseId => {
      const docKey = `${assignment.user_id}_${courseId}`;
      const docs = userCourseDocMap.get(docKey) || [];
      userDocs.push(...docs);

      const validForMonths = courseValidityMap.get(courseId);
      const courseAssignment = userCourseAssignmentMap.get(docKey);
      if (validForMonths && courseAssignment?.completed_at) {
        userCourses.push({
          valid_for_months: validForMonths,
          completed_at: courseAssignment.completed_at
        });
      }
    });

    // Calculate expiry using the comprehensive function
    const expiryDate = calculateAuthorizationExpiry(
      completedAt,
      validForDays,
      userDocs.map(d => ({ expires_on: d.expires_on })),
      userCourses
    );

    return {
      assignment_id: assignment.id,
      user_id: assignment.user_id,
      authorisation_id: assignment.authorisation_id,
      approved_at: assignment.approved_at,
      expires_at: expiryDate?.toISOString() ?? null,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      authorisation_title: auth?.title ?? null,
      department: auth?.department ?? null,
      valid_for_days: auth?.valid_for_days ?? null,
    };
  });

  // Include superseded authorisations (retake in progress) from history so the
  // old credential keeps showing as expired until the replacement is approved.
  // Degrades gracefully if the history table doesn't exist yet (migration 010).
  try {
    const { data: historyRows } = await adminClient
      .from("authorisation_assignment_history")
      .select("id, user_id, authorisation_id, approved_at, completed_at, expires_at, superseded_at")
      .order("superseded_at", { ascending: false });

    if (historyRows && historyRows.length > 0) {
      // A history row is only shown while there is no live completed
      // (approved) assignment for the same user + authorisation.
      const liveCompletedKeys = new Set(liveAssignments.map(a => `${a.user_id}_${a.authorisation_id}`));
      const seenKeys = new Set<string>();
      const pendingHistory: any[] = [];
      for (const h of historyRows) {
        const key = `${h.user_id}_${h.authorisation_id}`;
        if (liveCompletedKeys.has(key) || seenKeys.has(key)) continue;
        seenKeys.add(key);
        pendingHistory.push(h);
      }

      if (pendingHistory.length > 0) {
        const histUserIds = [...new Set(pendingHistory.map(h => h.user_id))];
        const histAuthIds = [...new Set(pendingHistory.map(h => h.authorisation_id))];

        const { data: histProfiles } = await adminClient
          .from("profiles")
          .select("id, full_name, email, archived_at")
          .in("id", histUserIds);
        const histProfileMap = new Map(
          (histProfiles || []).filter((p: any) => !p.archived_at).map((p: any) => [p.id, p])
        );

        const { data: histAuths } = await adminClient
          .from("authorisations")
          .select("id, title, valid_for_days, department")
          .in("id", histAuthIds);
        const histAuthMap = new Map((histAuths || []).map((a: any) => [a.id, a]));

        for (const h of pendingHistory) {
          const profile = histProfileMap.get(h.user_id);
          if (!profile) continue; // archived or missing user
          const auth = histAuthMap.get(h.authorisation_id);

          // Prefer the expiry stored at snapshot time; otherwise fall back to
          // approved_at + valid_for_days.
          let expiresAt = h.expires_at ?? null;
          if (!expiresAt && h.approved_at && auth?.valid_for_days) {
            const d = new Date(h.approved_at);
            d.setUTCDate(d.getUTCDate() + auth.valid_for_days);
            expiresAt = d.toISOString();
          }

          completedAuthorisations.push({
            assignment_id: `history_${h.id}`,
            user_id: h.user_id,
            authorisation_id: h.authorisation_id,
            approved_at: h.approved_at ?? h.completed_at ?? h.superseded_at,
            expires_at: expiresAt,
            full_name: profile.full_name ?? null,
            email: profile.email ?? null,
            authorisation_title: auth?.title ?? null,
            department: auth?.department ?? null,
            valid_for_days: auth?.valid_for_days ?? null,
            superseded: true,
          });
        }
      }
    }
  } catch (historyErr) {
    console.error("Could not load authorisation history for due dates:", historyErr);
  }

  // Apply search filter if provided BEFORE sorting
  if (q && q.trim()) {
    const searchTerm = q.trim().toLowerCase();
    completedAuthorisations = completedAuthorisations.filter(auth =>
      (auth.full_name?.toLowerCase().includes(searchTerm)) ||
      (auth.email?.toLowerCase().includes(searchTerm)) ||
      (auth.authorisation_title?.toLowerCase().includes(searchTerm))
    );
  }

  // Sort ALL filtered records by expiry date (soonest first, null values last)
  completedAuthorisations.sort((a, b) => {
    if (!a.expires_at && !b.expires_at) return 0;
    if (!a.expires_at) return 1; // null values go to the end
    if (!b.expires_at) return -1;
    
    const dateA = new Date(a.expires_at).getTime();
    const dateB = new Date(b.expires_at).getTime();
    return dateA - dateB;
  });

  // Now apply pagination to the sorted results
  const totalCount = completedAuthorisations.length;
  const paginatedAuthorisations = completedAuthorisations.slice(offset, offset + PAGE_SIZE);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return {
    authorisations: paginatedAuthorisations,
    totalPages,
    currentPage: page,
    totalCount
  };
}

type AuthorisationCompletionRow = {
  assignment_id: string;
  user_id: string;
  authorisation_id: string;
  approved_at: string;
  expires_at: string | null;
  full_name: string | null;
  email: string | null;
  authorisation_title: string | null;
  department: string | null;
  valid_for_days: number | null;
};

async function UsersSection({ q, page = 1 }: { q: string | null; page?: number }) {
  const { profiles, roleMap, grantablePool, totalPages, currentPage, totalCount } = await loadUsersAndRoles(q, page);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium">Users & Roles</h3>
          <span className="text-sm text-gray-600">
            {totalCount} total users
          </span>
        </div>
        <div className="flex gap-2">
          <Link
            href="/app/admin/users/archived"
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            View Archived Users
          </Link>
          <Link
            href="/app/admin/users/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Add New User
          </Link>
        </div>
      </div>

      <form method="get" action="/app/admin" className="flex items-center gap-2">
        <input type="hidden" name="tab" value="users" />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, email, or department"
          className="w-80 rounded-md border px-3 py-2 text-sm"
        />
        <button className="rounded-md border px-3 py-2 text-sm">Search</button>
      </form>

      {profiles.length === 0 && currentPage === 1 ? (
        <p className="text-sm text-gray-600">No users found.</p>
      ) : (
        <>
          <SortableUsersTable
            profiles={profiles}
            roleMap={roleMap}
            grantablePool={grantablePool}
          />
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-1 justify-between sm:hidden">
                {currentPage > 1 && (
                  <a
                    href={`/app/admin?tab=users&page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                    className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Previous
                  </a>
                )}
                {currentPage < totalPages && (
                  <a
                    href={`/app/admin?tab=users&page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                    className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Next
                  </a>
                )}
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{((currentPage - 1) * 50) + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * 50, totalCount)}</span> of{' '}
                    <span className="font-medium">{totalCount}</span> results
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    {currentPage > 1 && (
                      <a
                        href={`/app/admin?tab=users&page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                      >
                        <span className="sr-only">Previous</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                        </svg>
                      </a>
                    )}
                    
                    {/* Page numbers */}
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const pageNum = i + 1;
                      const isCurrentPage = pageNum === currentPage;
                      return (
                        <a
                          key={pageNum}
                          href={`/app/admin?tab=users&page=${pageNum}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                          className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                            isCurrentPage
                              ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                              : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                          }`}
                        >
                          {pageNum}
                        </a>
                      );
                    })}
                    
                    {currentPage < totalPages && (
                      <a
                        href={`/app/admin?tab=users&page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                      >
                        <span className="sr-only">Next</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </a>
                    )}
                  </nav>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

async function DocumentsSection({ q, page = 1 }: { q: string | null; page?: number }) {
  const result = await loadUserDocuments(q, page);
  const { documents, totalPages, currentPage, totalCount } = result;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">User Documents</h2>
          <span className="text-sm text-gray-600">
            {totalCount} total documents
          </span>
        </div>
        <form method="get" action="/app/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="documents" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, email, document, course, or module"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
        </form>
      </div>

      {documents.length === 0 && currentPage === 1 ? (
        <p className="text-sm text-gray-600">No documents found.</p>
      ) : (
        <>
          <SortableDocumentsTable documents={documents.map(doc => ({
            id: doc.id,
            title: doc.document_name,
            expires_on: doc.expires_on,
            created_at: doc.upload_date,
            profiles: {
              full_name: doc.full_name,
              email: doc.email
            },
            courses: {
              title: doc.course_title
            },
            course_modules: {
              title: doc.module_title
            }
          }))} />
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-1 justify-between sm:hidden">
                {currentPage > 1 && (
                  <a
                    href={`/app/admin?tab=documents&page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                    className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Previous
                  </a>
                )}
                {currentPage < totalPages && (
                  <a
                    href={`/app/admin?tab=documents&page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                    className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Next
                  </a>
                )}
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{((currentPage - 1) * 50) + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * 50, totalCount)}</span> of{' '}
                    <span className="font-medium">{totalCount}</span> results
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    {currentPage > 1 && (
                      <a
                        href={`/app/admin?tab=documents&page=${currentPage - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                        className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                      >
                        <span className="sr-only">Previous</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                        </svg>
                      </a>
                    )}
                    
                    {/* Page numbers */}
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const pageNum = i + 1;
                      const isCurrentPage = pageNum === currentPage;
                      return (
                        <a
                          key={pageNum}
                          href={`/app/admin?tab=documents&page=${pageNum}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                          className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                            isCurrentPage
                              ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                              : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                          }`}
                        >
                          {pageNum}
                        </a>
                      );
                    })}
                    
                    {currentPage < totalPages && (
                      <a
                        href={`/app/admin?tab=documents&page=${currentPage + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                        className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                      >
                        <span className="sr-only">Next</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </a>
                    )}
                  </nav>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* --------------------------
   PENDING AUTHORISATIONS
---------------------------*/
type PendingAuthorisationRow = {
  assignment_id: string;
  user_id: string;
  authorisation_id: string;
  authorisation_title: string;
  trainee_name: string;
  trainee_email: string;
  completed_at: string;
  total_courses: number;
  completed_courses: number;
};

async function loadPendingAuthorisations(q: string | null) {
  "use server";
  noStore();
  const supabase = await createSupabaseServer();
  const allowed = await hasRole("Authorization Approver");
  if (!allowed) redirect("/app/home?banner=no_access");

  // Get all authorisation assignments that are completed
  const { data: assignments, error: assignError } = await supabase
    .from("authorisation_assignments")
    .select(`
      id,
      user_id,
      authorisation_id,
      assignment_status,
      completed_at,
      authorisations!inner(
        id,
        title
      )
    `)
    .eq("assignment_status", "pending_approval")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (assignError) throw new Error(assignError.message);
  if (!assignments || assignments.length === 0) return [];

  // Get user profiles separately to avoid relationship ambiguity
  // Exclude archived users from pending approvals
  const userIds = [...new Set(assignments.map(a => a.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, email, archived_at")
    .in("id", userIds);

  if (profilesError) throw new Error(profilesError.message);

  // Create a lookup map for profiles (skip archived users)
  const profileMap = new Map(
    (profiles || []).filter(p => !p.archived_at).map(p => [p.id, p])
  );

  // For each completed authorisation, verify all courses are actually completed
  const pendingAuthorisations: PendingAuthorisationRow[] = [];

  for (const assignment of assignments) {
    // Skip assignments belonging to archived users
    if (!profileMap.has(assignment.user_id)) continue;

    // Get all courses for this authorisation
    const { data: authCourses, error: coursesError } = await supabase
      .from("authorisation_courses")
      .select(`
        course_id,
        courses!inner(
          id,
          title
        )
      `)
      .eq("authorisation_id", assignment.authorisation_id);

    if (coursesError) continue;
    if (!authCourses || authCourses.length === 0) continue;

    const courseIds = authCourses.map(ac => ac.course_id);

    // Check how many of these courses the user has completed
    const { data: completedCourses, error: completedError } = await supabase
      .from("course_assignments")
      .select("id, course_id")
      .eq("user_id", assignment.user_id)
      .eq("assignment_status", "completed")
      .in("course_id", courseIds);

    if (completedError) continue;

    const completedCount = completedCourses?.length || 0;
    const totalCount = authCourses.length;

    // Only include if all courses are completed (100%)
    if (completedCount === totalCount && totalCount > 0) {
      const profile = profileMap.get(assignment.user_id);
      pendingAuthorisations.push({
        assignment_id: assignment.id,
        user_id: assignment.user_id,
        authorisation_id: assignment.authorisation_id,
        authorisation_title: (assignment as any).authorisations.title,
        trainee_name: profile?.full_name || "",
        trainee_email: profile?.email || "",
        completed_at: assignment.completed_at,
        total_courses: totalCount,
        completed_courses: completedCount,
      });
    }
  }

  // Apply search filter if provided
  if (q && q.trim()) {
    const searchTerm = q.trim().toLowerCase();
    return pendingAuthorisations.filter(auth =>
      auth.trainee_name.toLowerCase().includes(searchTerm) ||
      auth.trainee_email.toLowerCase().includes(searchTerm) ||
      auth.authorisation_title.toLowerCase().includes(searchTerm)
    );
  }

  return pendingAuthorisations;
}

async function PendingAuthorisationsSection({ q }: { q: string | null }) {
  const pendingAuthorisations = await loadPendingAuthorisations(q);
  const isAuthorizationApprover = await hasRole("Authorization Approver");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pending Authorisations</h2>
        <form method="get" action="/app/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="pending_authorisations" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search trainee, authorisation, or email"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
        </form>
      </div>

      {pendingAuthorisations.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">No pending authorisations found.</p>
          <Link
            href="/app/admin/diagnose-authorizations"
            className="inline-flex items-center px-3 py-2 border border-blue-600 text-sm font-medium rounded-md text-blue-600 hover:bg-blue-50"
          >
            Diagnose Authorization Issues →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Authorisation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trainee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Courses
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pendingAuthorisations.map((auth) => (
                <tr key={auth.assignment_id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {auth.authorisation_title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{auth.trainee_name}</div>
                    <div className="text-sm text-gray-500">{auth.trainee_email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(auth.completed_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {auth.completed_courses}/{auth.total_courses} completed
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {isAuthorizationApprover ? (
                      <Link
                        href={`/app/admin/review/${auth.assignment_id}`}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Review
                      </Link>
                    ) : (
                      <span className="text-gray-400 text-xs">Authorization Approver Only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --------------------------
   AUDIT TRAIL
---------------------------*/

const AUDIT_PAGE_SIZE = 50;

const AUDIT_ACTION_LABELS: Record<string, string> = {
  created: "Created",
  duplicated: "Duplicated",
  updated: "Updated",
  status_changed: "Status changed",
  module_added: "Module added",
  module_renamed: "Module renamed",
  module_updated: "Module updated",
  module_removed: "Module removed",
  content_added: "Content added",
  content_updated: "Content updated",
  content_removed: "Content removed",
  quiz_updated: "Quiz settings updated",
  question_added: "Question added",
  question_updated: "Question updated",
  question_removed: "Question removed",
  option_added: "Answer option added",
  option_updated: "Answer option updated",
  option_removed: "Answer option removed",
  requirement_added: "Requirement added",
  requirement_updated: "Requirement updated",
  requirement_removed: "Requirement removed",
  equipment_added: "Equipment added",
  equipment_updated: "Equipment updated",
  equipment_removed: "Equipment removed",
  course_linked: "Course linked",
  course_unlinked: "Course unlinked",
};

function formatAuditValue(v: any): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(empty)";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function AuditChangeDetails({ details }: { details: any }) {
  const changes = details?.changes && typeof details.changes === "object" ? details.changes : null;
  const duplicatedFrom = details?.duplicated_from;
  const contextParts: string[] = [];
  if (details?.module) contextParts.push(`Module: ${details.module}`);
  if (details?.item) contextParts.push(String(details.item));

  if (!changes && !duplicatedFrom && contextParts.length === 0)
    return <span className="text-gray-400">—</span>;

  return (
    <div className="space-y-0.5">
      {contextParts.length > 0 ? (
        <div className="text-sm text-gray-700 font-medium">{contextParts.join(" — ")}</div>
      ) : null}
      {duplicatedFrom ? (
        <div className="text-sm text-gray-700">
          Copied from <span className="font-medium">{duplicatedFrom}</span>
        </div>
      ) : null}
      {changes
        ? Object.entries(changes).map(([field, ch]: [string, any]) => (
            <div key={field} className="text-sm text-gray-700">
              <span className="font-medium">{field.replace(/_/g, " ")}</span>:{" "}
              <span className="text-gray-500 line-through">{formatAuditValue(ch?.from)}</span>
              {" → "}
              <span>{formatAuditValue(ch?.to)}</span>
            </div>
          ))
        : null}
    </div>
  );
}

async function AuditTrailSection({ q, page = 1 }: { q: string | null; page?: number }) {
  noStore();
  const admin = supabaseAdmin();
  const currentPage = Math.max(1, page || 1);
  const from = (currentPage - 1) * AUDIT_PAGE_SIZE;

  let query = admin
    .from("content_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE - 1);

  // Sanitize user input for PostgREST filter grammar: strip reserved chars
  // (commas, parens, quotes, dots) so the .or() expression cannot be tampered with.
  const term = (q ?? "").trim().replace(/[,()."'\\]/g, " ").replace(/\s+/g, " ").trim();
  if (term) {
    const like = `%${term}%`;
    query = query.or(
      [
        `entity_name.ilike.${like}`,
        `actor_name.ilike.${like}`,
        `action.ilike.${like}`,
        `entity_type.ilike.${like}`,
      ].join(",")
    );
  }

  const { data: rows, count, error } = await query;

  if (error) {
    const missingTable = error.code === "PGRST205" || /content_audit_log/.test(error.message || "");
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Audit Trail</h2>
        <p className="text-sm text-amber-700">
          {missingTable
            ? "The audit trail table has not been set up yet. Run migration app/migrations/012_content_audit_log.sql in the Supabase SQL editor to enable it."
            : `Failed to load audit trail: ${error.message}`}
        </p>
      </div>
    );
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / AUDIT_PAGE_SIZE));
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-NZ", {
      timeZone: "Pacific/Auckland",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  const pageHref = (p: number) =>
    `/app/admin?tab=audit_trail&page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Audit Trail</h2>
          <span className="text-sm text-gray-600">
            {totalCount} change{totalCount !== 1 ? "s" : ""} to courses & authorisations
          </span>
        </div>
        <form method="get" action="/app/admin" className="flex items-center gap-2">
          <input type="hidden" name="tab" value="audit_trail" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search course, authorisation, or user"
            className="w-80 rounded-md border px-3 py-2 text-sm"
          />
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Search</button>
        </form>
      </div>

      {(rows ?? []).length === 0 ? (
        <p className="text-sm text-gray-600">
          {q ? "No audit entries match your search." : "No changes recorded yet. Course and authorisation changes will appear here from now on."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Changed By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {(rows ?? []).map((r: any) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{fmt(r.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                        r.entity_type === "course" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
                      }`}>
                        {r.entity_type === "course" ? "Course" : "Authorisation"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {r.entity_name || <span className="text-gray-400">Unknown</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {AUDIT_ACTION_LABELS[r.action] || r.action}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {r.actor_name || <span className="text-gray-400">Unknown</span>}
                    </td>
                    <td className="px-4 py-3">
                      <AuditChangeDetails details={r.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1 py-2">
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{from + 1}</span> to{" "}
                <span className="font-medium">{Math.min(from + AUDIT_PAGE_SIZE, totalCount)}</span> of{" "}
                <span className="font-medium">{totalCount}</span>
              </p>
              <div className="flex gap-2">
                {currentPage > 1 && (
                  <a href={pageHref(currentPage - 1)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
                    Previous
                  </a>
                )}
                {currentPage < totalPages && (
                  <a href={pageHref(currentPage + 1)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
                    Next
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}