// Tests for the backfill sweep pagination logic.
// Run with: node --test scripts/backfill-lib.test.mjs
//
// The fake Supabase client below enforces PostgREST's silent 1000-row cap:
// any query without an explicit .range() (or one that never pages past 1000)
// returns at most 1000 rows with NO error — exactly how the real API behaves.
// The tests prove rows beyond the first page are still evaluated/backfilled.
import test from "node:test";
import assert from "node:assert/strict";
import { computeMissingAssignments, fetchAllRows } from "./backfill-lib.mjs";

const HARD_CAP = 1000;

function makeFakeSb(tables, { onUpsert } = {}) {
  return {
    from(table) {
      const rows = tables[table] || [];
      const filters = [];
      let sortKeys = [];
      let rangeFrom = 0;
      let rangeTo = HARD_CAP - 1;
      const builder = {
        select() {
          return builder;
        },
        eq(col, val) {
          filters.push((r) => r[col] === val);
          return builder;
        },
        in(col, vals) {
          const set = new Set(vals);
          filters.push((r) => set.has(r[col]));
          return builder;
        },
        order(col) {
          sortKeys.push(col);
          return builder;
        },
        range(from, to) {
          rangeFrom = from;
          rangeTo = to;
          return builder;
        },
        upsert(newRows, opts) {
          if (onUpsert) onUpsert(table, newRows, opts);
          return {
            then(resolve) {
              resolve({ data: null, error: null });
            },
            select() {
              return Promise.resolve({ data: newRows, error: null });
            },
          };
        },
        then(resolve) {
          let out = rows.filter((r) => filters.every((f) => f(r)));
          if (sortKeys.length > 0) {
            out = [...out].sort((a, b) => {
              for (const k of sortKeys) {
                if (a[k] < b[k]) return -1;
                if (a[k] > b[k]) return 1;
              }
              return 0;
            });
          }
          // PostgREST hard cap: never return more than 1000 rows per request.
          const sliceTo = Math.min(rangeTo + 1, rangeFrom + HARD_CAP);
          out = out.slice(rangeFrom, sliceTo);
          resolve({ data: out, error: null });
        },
      };
      return builder;
    },
  };
}

test("fetchAllRows pages past the 1000-row cap", async () => {
  const rows = Array.from({ length: 2503 }, (_, i) => ({ id: String(i).padStart(6, "0") }));
  const sb = makeFakeSb({ t: rows });
  const all = await fetchAllRows(() => sb.from("t").select("id").order("id"));
  assert.equal(all.length, 2503);
  assert.equal(new Set(all.map((r) => r.id)).size, 2503);
});

test("assignments beyond the first 1000 are still evaluated and reported missing", async () => {
  // 1500 active trainee assignments, one per user, all on one authorisation
  // with one published course. Users 0-1099 already have the course
  // assignment row; users 1100-1499 (all beyond the first page) do not.
  const N = 1500;
  const assignments = Array.from({ length: N }, (_, i) => ({
    id: `as-${String(i).padStart(6, "0")}`,
    user_id: `u-${String(i).padStart(6, "0")}`,
    authorisation_id: "auth-1",
    role: "trainee",
    assignment_status: "assigned",
  }));
  const profiles = Array.from({ length: N }, (_, i) => ({
    id: `u-${String(i).padStart(6, "0")}`,
    archived_at: null,
  }));
  const existing = Array.from({ length: 1100 }, (_, i) => ({
    id: `ca-${String(i).padStart(6, "0")}`,
    user_id: `u-${String(i).padStart(6, "0")}`,
    course_id: "course-1",
    role: "trainee",
  }));
  const sb = makeFakeSb({
    authorisation_assignments: assignments,
    profiles,
    authorisation_courses: [{ authorisation_id: "auth-1", course_id: "course-1" }],
    courses: [{ id: "course-1", title: "C1", status: "published" }],
    course_assignments: existing,
  });

  const { checkedAssignments, missing } = await computeMissingAssignments(sb);
  assert.equal(checkedAssignments, N);
  assert.equal(missing.length, 400);
  const missingUsers = new Set(missing.map((m) => m.userId));
  assert.ok(missingUsers.has("u-001100"));
  assert.ok(missingUsers.has("u-001499"));
  assert.ok(!missingUsers.has("u-000999"));
});

test("existing rows beyond the first 1000 are not misreported as missing", async () => {
  // One authorisation, 30 published courses, 60 users, ALL 1800 course
  // assignment rows already exist (>1000 in a single user/course chunk pair).
  const users = Array.from({ length: 60 }, (_, i) => `u-${String(i).padStart(3, "0")}`);
  const courseIds = Array.from({ length: 30 }, (_, i) => `c-${String(i).padStart(3, "0")}`);
  const assignments = users.map((u, i) => ({
    id: `as-${String(i).padStart(3, "0")}`,
    user_id: u,
    authorisation_id: "auth-1",
    role: "trainee",
    assignment_status: "in_progress",
  }));
  const existing = [];
  let n = 0;
  for (const u of users)
    for (const c of courseIds)
      existing.push({ id: `ca-${String(n++).padStart(6, "0")}`, user_id: u, course_id: c, role: "trainee" });
  assert.ok(existing.length > HARD_CAP);
  const sb = makeFakeSb({
    authorisation_assignments: assignments,
    profiles: users.map((u) => ({ id: u, archived_at: null })),
    authorisation_courses: courseIds.map((c) => ({ authorisation_id: "auth-1", course_id: c })),
    courses: courseIds.map((c) => ({ id: c, title: c, status: "published" })),
    course_assignments: existing,
  });
  const { missing } = await computeMissingAssignments(sb);
  assert.equal(missing.length, 0);
});

test("archived users and unpublished courses are excluded", async () => {
  const sb = makeFakeSb({
    authorisation_assignments: [
      { id: "as-1", user_id: "u-1", authorisation_id: "auth-1", role: "trainee", assignment_status: "assigned" },
      { id: "as-2", user_id: "u-2", authorisation_id: "auth-1", role: "trainee", assignment_status: "assigned" },
      { id: "as-3", user_id: "u-3", authorisation_id: "auth-1", role: "trainee", assignment_status: "revoked" },
    ],
    profiles: [
      { id: "u-1", archived_at: null },
      { id: "u-2", archived_at: "2026-01-01" },
      { id: "u-3", archived_at: null },
    ],
    authorisation_courses: [
      { authorisation_id: "auth-1", course_id: "c-pub" },
      { authorisation_id: "auth-1", course_id: "c-draft" },
    ],
    courses: [
      { id: "c-pub", title: "Published", status: "published" },
      { id: "c-draft", title: "Draft", status: "draft" },
    ],
    course_assignments: [],
  });
  const { missing } = await computeMissingAssignments(sb);
  // Only u-1 (active, non-archived) x c-pub (published)
  assert.deepEqual(missing, [{ userId: "u-1", courseId: "c-pub", authId: "auth-1" }]);
});
