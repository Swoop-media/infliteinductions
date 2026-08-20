import assert from "node:assert/strict";
import test from "node:test";
import {
  assertResumableCourseVersion,
  changeDetailsForCourseVersion,
  courseVersionReleaseAttribution,
  COURSE_VERSION_LOG_PAGE_SIZE,
  loadCourseVersionLogPage,
  publisherNameForCourseVersion,
  requireCourseVersionChangeNotes,
  sanitizeCourseVersionLogSearch,
} from "./course-version-logs.ts";

test("course version log helpers preserve release details and clarify legacy fallbacks", () => {
  assert.equal(
    changeDetailsForCourseVersion({ version_number: 4, change_notes: " Updated evacuation procedure. " }),
    "Updated evacuation procedure."
  );
  assert.equal(
    changeDetailsForCourseVersion({ version_number: 1, change_notes: null }),
    "Baseline version — no publisher summary was captured."
  );
  assert.equal(
    changeDetailsForCourseVersion({ version_number: 2, change_notes: null }),
    "No change summary was recorded for this older release."
  );
  assert.equal(
    publisherNameForCourseVersion({ version_number: 3, published_by: "user-id" }, { full_name: null, email: "publisher@example.com" }),
    "publisher@example.com"
  );
  assert.equal(
    publisherNameForCourseVersion({ version_number: 1, published_by: null }, null),
    "System baseline"
  );
  assert.equal(
    publisherNameForCourseVersion({ version_number: 3, published_by: "deleted-user-id" }, null),
    "Former or unknown user"
  );
});

test("course version release summaries must be meaningful and search terms are PostgREST-safe", () => {
  assert.equal(
    requireCourseVersionChangeNotes("  Replaced the final assessment  "),
    "Replaced the final assessment"
  );
  assert.throws(() => requireCourseVersionChangeNotes(" \n\t "), /summary of what changed/i);
  assert.equal(
    sanitizeCourseVersionLogSearch(`  first,(aid)* "course"  `),
    "first aid course"
  );
  assert.deepEqual(
    courseVersionReleaseAttribution(
      "  Replaced the final assessment  ",
      "publisher-id",
      "2026-08-20T01:02:03.000Z"
    ),
    {
      change_notes: "Replaced the final assessment",
      published_by: "publisher-id",
      published_at: "2026-08-20T01:02:03.000Z",
    }
  );
  assert.doesNotThrow(() =>
    assertResumableCourseVersion({ version_number: 3, change_notes: "Original release summary" })
  );
  assert.throws(
    () => assertResumableCourseVersion({ version_number: 3, change_notes: null }),
    /interrupted course version has no immutable change summary/i
  );
});

function fakeQuery(result: any) {
  const calls: Array<{ method: string; args: any[] }> = [];
  const query: any = {
    calls,
    select(...args: any[]) {
      calls.push({ method: "select", args });
      return query;
    },
    in(...args: any[]) {
      calls.push({ method: "in", args });
      return query;
    },
    order(...args: any[]) {
      calls.push({ method: "order", args });
      return query;
    },
    range(...args: any[]) {
      calls.push({ method: "range", args });
      return query;
    },
    or(...args: any[]) {
      calls.push({ method: "or", args });
      return query;
    },
    then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

test("course version logs deny the service-role data path to non-Admins", async () => {
  const adminClient = {
    from() {
      assert.fail("the database must not be queried for a non-Admin");
    },
  };
  await assert.rejects(
    loadCourseVersionLogPage({ isAdmin: false, adminClient, page: 1 }),
    /Admin access is required/
  );
});

test("course version logs query successful releases newest-first with sanitized search and server pagination", async () => {
  const query = fakeQuery({
    data: [{ id: "version-26", version_number: 26 }],
    count: 51,
    error: null,
  });
  const tables: string[] = [];
  const result = await loadCourseVersionLogPage({
    isAdmin: true,
    adminClient: {
      from(table: string) {
        tables.push(table);
        return query;
      },
    },
    q: "  fire,(drill)  ",
    page: 2,
  });

  assert.deepEqual(tables, ["course_versions"]);
  assert.equal(result.currentPage, 2);
  assert.equal(result.totalCount, 51);
  assert.equal(result.totalPages, 3);
  assert.equal(result.term, "fire drill");
  assert.deepEqual(
    query.calls.filter((call: any) => call.method === "order").map((call: any) => call.args),
    [
      ["published_at", { ascending: false }],
      ["version_number", { ascending: false }],
      ["id", { ascending: false }],
    ]
  );
  assert.deepEqual(
    query.calls.find((call: any) => call.method === "in")?.args,
    ["status", ["published", "superseded"]]
  );
  assert.deepEqual(
    query.calls.find((call: any) => call.method === "range")?.args,
    [COURSE_VERSION_LOG_PAGE_SIZE, COURSE_VERSION_LOG_PAGE_SIZE * 2 - 1]
  );
  assert.deepEqual(
    query.calls.find((call: any) => call.method === "or")?.args,
    ["title.ilike.%fire drill%,change_notes.ilike.%fire drill%"]
  );
  assert.doesNotMatch(
    query.calls.find((call: any) => call.method === "select")?.args[0],
    /snapshot/
  );
});

test("course version log pagination returns the last available page after results shrink", async () => {
  const firstQuery = fakeQuery({ data: [], count: 30, error: null });
  const finalQuery = fakeQuery({
    data: [{ id: "last-version", version_number: 1 }],
    count: 30,
    error: null,
  });
  const queries = [firstQuery, finalQuery];
  const result = await loadCourseVersionLogPage({
    isAdmin: true,
    adminClient: {
      from() {
        return queries.shift();
      },
    },
    page: 9,
  });

  assert.equal(result.currentPage, 2);
  assert.equal(result.totalPages, 2);
  assert.equal(result.rows[0].id, "last-version");
  assert.deepEqual(
    finalQuery.calls.find((call: any) => call.method === "range")?.args,
    [COURSE_VERSION_LOG_PAGE_SIZE, COURSE_VERSION_LOG_PAGE_SIZE * 2 - 1]
  );
});