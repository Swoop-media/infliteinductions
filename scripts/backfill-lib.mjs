// Shared logic for the one-off trainee course-assignment backfill sweep.
// Mirrors backfillMissingCourseAssignments() in lib/authorizations/auto-fix.ts.
// All bulk reads paginate with deterministic ordering: Supabase (PostgREST)
// silently caps results at 1000 rows per request, so a single select would
// silently truncate and misreport rows as missing (or skip assignments).

export const PAGE = 1000;

export function chunk(arr, n = 150) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Fetch every row of a query by paging with .range() until a short page.
 * makeQuery must return a fresh PostgREST builder each call, already ordered
 * deterministically (e.g. .order("id")).
 */
export async function fetchAllRows(makeQuery) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if ((data || []).length < PAGE) break;
  }
  return out;
}

/**
 * Compute missing trainee course_assignments rows for every active
 * (assigned/in_progress/pending_approval, non-archived) trainee authorisation
 * assignment and every linked *published* course.
 * Returns { checkedAssignments, missing: [{userId, courseId, authId}], courseTitle: Map }
 */
export async function computeMissingAssignments(sb) {
  // 1) Active trainee authorisation assignments (paginated, ordered by id)
  const assignments = await fetchAllRows(() =>
    sb
      .from("authorisation_assignments")
      .select("id, user_id, authorisation_id")
      .eq("role", "trainee")
      .in("assignment_status", ["assigned", "in_progress", "pending_approval"])
      .order("id")
  );

  // 2) Exclude archived users
  const allUserIds = [...new Set(assignments.map((a) => a.user_id))];
  const archived = new Set();
  for (const ids of chunk(allUserIds, 150)) {
    const profs = await fetchAllRows(() =>
      sb.from("profiles").select("id, archived_at").in("id", ids).order("id")
    );
    profs.forEach((p) => p.archived_at && archived.add(p.id));
  }
  const active = assignments.filter((a) => !archived.has(a.user_id));

  // 3) Linked courses per authorisation (paginated per chunk)
  const authIds = [...new Set(active.map((a) => a.authorisation_id))];
  const authCourses = new Map();
  for (const ids of chunk(authIds, 150)) {
    const acs = await fetchAllRows(() =>
      sb
        .from("authorisation_courses")
        .select("authorisation_id, course_id")
        .in("authorisation_id", ids)
        .order("authorisation_id")
        .order("course_id")
    );
    acs.forEach((ac) => {
      if (!authCourses.has(ac.authorisation_id)) authCourses.set(ac.authorisation_id, []);
      authCourses.get(ac.authorisation_id).push(ac.course_id);
    });
  }

  // 4) Only published courses
  const allCourseIds = [...new Set([...authCourses.values()].flat())];
  const published = new Set();
  const courseTitle = new Map();
  for (const ids of chunk(allCourseIds, 150)) {
    const courses = await fetchAllRows(() =>
      sb.from("courses").select("id, title, status").in("id", ids).order("id")
    );
    courses.forEach((c) => {
      courseTitle.set(c.id, c.title);
      if (c.status === "published") published.add(c.id);
    });
  }

  // 5) Existing trainee course assignments (paginated per chunk pair)
  const activeUserIds = [...new Set(active.map((a) => a.user_id))];
  const relevantCourseIds = allCourseIds.filter((c) => published.has(c));
  const haveRow = new Set();
  for (const uids of chunk(activeUserIds, 50)) {
    for (const cids of chunk(relevantCourseIds, 100)) {
      const existing = await fetchAllRows(() =>
        sb
          .from("course_assignments")
          .select("id, user_id, course_id")
          .eq("role", "trainee")
          .in("user_id", uids)
          .in("course_id", cids)
          .order("id")
      );
      existing.forEach((r) => haveRow.add(`${r.user_id}:${r.course_id}`));
    }
  }

  // 6) Compute missing
  const missing = [];
  const seen = new Set();
  for (const a of active) {
    for (const cid of authCourses.get(a.authorisation_id) || []) {
      if (!published.has(cid)) continue;
      const k = `${a.user_id}:${cid}`;
      if (haveRow.has(k) || seen.has(k)) continue;
      seen.add(k);
      missing.push({ userId: a.user_id, courseId: cid, authId: a.authorisation_id });
    }
  }
  return { checkedAssignments: active.length, missing, courseTitle };
}

/** Insert missing rows (upsert with ignoreDuplicates on the unique key). */
export async function insertMissingAssignments(sb, missing) {
  const now = new Date().toISOString();
  let attempted = 0;
  for (const batch of chunk(missing, 200)) {
    const rows = batch.map((m) => ({
      user_id: m.userId,
      course_id: m.courseId,
      role: "trainee",
      assignment_status: "assigned",
      created_by: m.userId, // NOT NULL; no acting user in a sweep
      assigned_by: null,
      assigned_at: now,
      created_at: now,
    }));
    const { error } = await sb
      .from("course_assignments")
      .upsert(rows, { onConflict: "course_id,user_id,role", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    attempted += rows.length;
  }
  return attempted;
}
