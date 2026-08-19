// One-off sweep (silent learner lockout backfill).
// For every active (assigned/in_progress/pending_approval, non-archived)
// trainee authorisation assignment, ensure a trainee course_assignments row
// exists for every linked *published* course. Mirrors
// backfillMissingCourseAssignments() in lib/authorizations/auto-fix.ts.
// Usage: node scripts/backfill-auth-course-assignments.mjs [--apply]
import { createClient } from "@supabase/supabase-js";
import { chunk, computeMissingAssignments, insertMissingAssignments } from "./backfill-lib.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env vars");
const sb = createClient(url, key, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");

const { checkedAssignments, missing, courseTitle } = await computeMissingAssignments(sb);
console.log(`Active trainee authorisation assignments checked: ${checkedAssignments}`);
console.log(`Missing trainee course_assignments rows: ${missing.length}`);

if (missing.length > 0) {
  const authTitles = new Map();
  for (const ids of chunk([...new Set(missing.map((m) => m.authId))])) {
    const { data } = await sb.from("authorisations").select("id, title").in("id", ids);
    (data || []).forEach((a) => authTitles.set(a.id, a.title));
  }
  const userNames = new Map();
  for (const ids of chunk([...new Set(missing.map((m) => m.userId))])) {
    const { data } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
    (data || []).forEach((p) => userNames.set(p.id, p.full_name || p.email));
  }
  const byAuth = new Map();
  for (const m of missing) {
    if (!byAuth.has(m.authId)) byAuth.set(m.authId, []);
    byAuth.get(m.authId).push(m);
  }
  for (const [authId, rows] of byAuth) {
    console.log(`\nAuthorisation: ${authTitles.get(authId) || authId} (${authId})`);
    const users = new Set(rows.map((r) => r.userId));
    console.log(`  ${users.size} user(s), ${rows.length} missing row(s)`);
    for (const r of rows) {
      console.log(`  - ${userNames.get(r.userId) || r.userId} -> ${courseTitle.get(r.courseId) || r.courseId}`);
    }
  }
}

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to insert missing rows.");
  process.exit(0);
}

const attempted = await insertMissingAssignments(sb, missing);
console.log(`\nInserted (upserted) ${attempted} missing course_assignments row(s).`);
