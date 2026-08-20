/**
 * Database integration checks for the release-note lifecycle.
 *
 * The test starts a fresh local PostgreSQL cluster in the system temp
 * directory, applies the real migrations, and deletes the cluster on exit.
 * It never reads application database environment variables or connects to
 * Supabase, so it is safe to run locally and in CI:
 *
 *   pnpm test:release-notes-db
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { Pool } from "pg";

const migrationPath      = new URL("../app/migrations/033_release_notes.sql",      import.meta.url);
const migration034Path   = new URL("../app/migrations/034_release_note_reads.sql",  import.meta.url);
const liveVerificationPath = new URL("./verify-release-notes-policies.sql", import.meta.url);
const testDatabase = "release_notes_integration";
let clusterDirectory;
let socketDirectory;
let postgres;
let postgresExit;
let pool;

function postgresBinary(name) {
  if (process.env.PG_BINDIR) return join(process.env.PG_BINDIR, name);

  const pgConfig = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
  return pgConfig.status === 0 ? join(pgConfig.stdout.trim(), name) : name;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "pipe", ...options });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForDatabase(connectionOptions) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = new Pool(connectionOptions);
    try {
      await candidate.query("select 1");
      await candidate.end();
      return;
    } catch (error) {
      lastError = error;
      await candidate.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError ?? new Error("Temporary PostgreSQL did not start");
}

async function startTemporaryDatabase() {
  clusterDirectory = await mkdtemp(join(tmpdir(), "release-notes-pg-"));
  socketDirectory  = join(clusterDirectory, "socket");
  await run(postgresBinary("initdb"), [
    "-D", clusterDirectory,
    "--auth=trust",
    "--no-locale",
    "--encoding=UTF8",
    "--username=postgres",
  ]);
  await mkdir(socketDirectory);

  const port = await unusedPort();
  postgres = spawn(
    postgresBinary("postgres"),
    ["-D", clusterDirectory, "-k", socketDirectory, "-p", String(port), "-h", ""],
    { stdio: "pipe" }
  );
  postgresExit = new Promise((resolve) => postgres.once("exit", resolve));
  let startupError = "";
  postgres.stderr.on("data", (chunk) => { startupError += chunk; });
  postgres.once("error", (error) => { startupError += error.message; });

  const adminConnection = { host: socketDirectory, port, user: "postgres", database: "postgres" };
  try {
    await waitForDatabase(adminConnection);
  } catch (error) {
    throw new Error(`Temporary PostgreSQL failed to start: ${startupError || error.message}`);
  }

  const bootstrapPool = new Pool(adminConnection);
  await bootstrapPool.query(`create database ${testDatabase}`);
  await bootstrapPool.end();

  pool = new Pool({ ...adminConnection, database: testDatabase });
}

async function stopTemporaryDatabase() {
  await pool?.end().catch(() => undefined);

  if (postgres && postgres.exitCode === null && postgres.signalCode === null) {
    postgres.kill("SIGTERM");
    const stopped = await Promise.race([
      postgresExit.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
    ]);
    if (!stopped && postgres.exitCode === null && postgres.signalCode === null) {
      postgres.kill("SIGKILL");
      await Promise.race([postgresExit, new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  }

  if (clusterDirectory) await rm(clusterDirectory, { recursive: true, force: true });
}

async function bootstrapReleaseNoteSchema() {
  const migration033 = await readFile(migrationPath,    "utf8");
  const migration034 = await readFile(migration034Path, "utf8");

  await pool.query(`
    create schema auth;
    create extension if not exists pgcrypto;

    create table auth.users (
      id uuid primary key
    );

    create table public.roles (
      id   uuid primary key default gen_random_uuid(),
      name text not null unique
    );

    create table public.user_roles (
      user_id uuid not null references auth.users(id) on delete cascade,
      role_id uuid not null references public.roles(id) on delete cascade,
      primary key (user_id, role_id)
    );

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    create or replace function public.app_has_role(u uuid, wanted text)
    returns boolean
    language sql
    stable
    set search_path = public
    as $$
      select exists(
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = u
          and lower(r.name) = lower(wanted)
      );
    $$;

    create role authenticated nologin;
    grant usage on schema public, auth to authenticated;
    grant select on public.roles, public.user_roles to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant execute on function public.app_has_role(uuid, text) to authenticated;
  `);

  // Apply 033 twice so its guarded reconciliation statements stay executable.
  await pool.query(migration033);
  await pool.query(`
    create policy "rn_select_all_auth"
    on public.release_notes
    for select
    to authenticated
    using (true);
  `);
  await pool.query(migration033);

  // Apply 034 twice to verify idempotency during bootstrap.
  await pool.query(migration034);
  await pool.query(migration034);

  await pool.query(`
    grant select, insert, update, delete
      on public.release_notes, public.release_note_items, public.release_note_reads
      to authenticated;
    grant execute
      on function public.get_unread_release_note_count(),
                 public.mark_release_notes_read(jsonb),
                 public.get_published_release_notes_snapshot()
      to authenticated;
  `);
}

async function createActors() {
  const adminId  = randomUUID();
  const memberId = randomUUID();
  await pool.query("insert into auth.users (id) values ($1), ($2)", [adminId, memberId]);
  const role = await pool.query(
    `insert into public.roles (id, name)
     values ($1, 'Admin')
     on conflict (name) do update set name = excluded.name
     returning id`,
    [randomUUID()]
  );
  const roleId = role.rows[0].id;
  await pool.query("insert into public.user_roles (user_id, role_id) values ($1, $2)", [adminId, roleId]);
  return { adminId, memberId };
}

async function asAuthenticated(userId, action) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query(
      `select
         set_config('request.jwt.claim.sub',  $1, true),
         set_config('request.jwt.claim.role', 'authenticated', true)`,
      [userId]
    );
    const result = await action(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function createDraft(adminId, title = "Draft release") {
  const result = await asAuthenticated(adminId, (client) =>
    client.query(
      `insert into public.release_notes (title, release_date, created_by)
       values ($1, current_date, $2)
       returning id, status, published_at, published_by, created_by`,
      [title, adminId]
    )
  );
  return result.rows[0];
}

async function addCompleteItem(adminId, releaseId) {
  const result = await asAuthenticated(adminId, (client) =>
    client.query(
      `insert into public.release_note_items (release_note_id, order_index, title, location, details)
       values ($1, 0, 'Change title', 'Dashboard', 'A complete release-note item.')
       returning id`,
      [releaseId]
    )
  );
  return result.rows[0].id;
}

async function publish(adminId, releaseId) {
  return asAuthenticated(adminId, (client) =>
    client.query(
      `update public.release_notes
       set status = 'published'
       where id = $1
       returning status, published_at, published_by`,
      [releaseId]
    )
  );
}

/**
 * Publish a draft and return its published_at as an exact ISO-8601 string
 * preserving microsecond precision (avoids JS Date millisecond truncation).
 */
async function publishAndGetTimestamp(adminId, releaseId) {
  const result = await asAuthenticated(adminId, (client) =>
    client.query(
      `update public.release_notes
       set status = 'published'
       where id = $1
       returning status, published_at::text as published_at_text`,
      [releaseId]
    )
  );
  return result.rows[0].published_at_text;
}

/**
 * Read published_at from the DB as an exact text string for precise comparisons.
 */
async function getPublishedAtText(releaseId) {
  const result = await pool.query(
    "select published_at::text as published_at_text from public.release_notes where id = $1",
    [releaseId]
  );
  return result.rows[0].published_at_text;
}

async function startActorTransaction(client, userId) {
  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query("set local statement_timeout = '5s'");
  await client.query(
    `select
       set_config('request.jwt.claim.sub',  $1, true),
       set_config('request.jwt.claim.role', 'authenticated', true)`,
    [userId]
  );
}

async function waitForBlockedQuery(applicationName, blockingPid) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query(
      `select 1
       from pg_stat_activity
       where application_name = $1
         and state = 'active'
         and $2 = any(pg_blocking_pids(pid))`,
      [applicationName, blockingPid]
    );
    if (result.rowCount === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the item mutation to block on publication");
}

function rejectsRls(action) {
  return assert.rejects(action, /row-level security|permission denied/i);
}

before(async () => {
  await startTemporaryDatabase();
  await bootstrapReleaseNoteSchema();
});

after(async () => {
  await stopTemporaryDatabase();
});

// ---------------------------------------------------------------------------

test("migration enables release-note RLS, policies, and lifecycle triggers", async () => {
  const result = await pool.query(`
    select
      (select relrowsecurity from pg_class where oid = 'public.release_notes'::regclass)      as notes_rls,
      (select relrowsecurity from pg_class where oid = 'public.release_note_items'::regclass) as items_rls,
      (select relrowsecurity from pg_class where oid = 'public.release_note_reads'::regclass) as reads_rls,
      (select count(*)::integer from pg_policy where polrelid = 'public.release_notes'::regclass)      as note_policies,
      (select count(*)::integer from pg_policy where polrelid = 'public.release_note_items'::regclass) as item_policies,
      (select count(*)::integer from pg_policy where polrelid = 'public.release_note_reads'::regclass) as read_policies,
      (select count(*)::integer from pg_trigger
       where tgrelid = 'public.release_notes'::regclass and not tgisinternal)      as note_triggers,
      (select count(*)::integer from pg_trigger
       where tgrelid = 'public.release_note_items'::regclass and not tgisinternal) as item_triggers,
      (select count(*)::integer from pg_proc
       where proname in (
         'get_unread_release_note_count',
         'mark_release_notes_read',
         'get_published_release_notes_snapshot'
       )
         and pronamespace = 'public'::regnamespace) as rpc_count
  `);
  assert.deepEqual(result.rows[0], {
    notes_rls:     true,
    items_rls:     true,
    reads_rls:     true,
    note_policies: 4,
    item_policies: 4,
    read_policies: 3,
    note_triggers: 3,
    item_triggers: 2,
    rpc_count:     3,
  });
});

test("manual live-policy verifier passes for the managed policy set", async () => {
  await createActors();
  const verification = await readFile(liveVerificationPath, "utf8");
  await pool.query(verification);
});

test("manual live-policy verifier clearly identifies a legacy permissive policy", async () => {
  await createActors();
  const verification = await readFile(liveVerificationPath, "utf8");
  const client = await pool.connect();
  try {
    await client.query(`
      create policy "rn_select_all_auth"
      on public.release_notes
      for select
      to authenticated
      using (true)
    `);

    await assert.rejects(
      () => client.query(verification),
      (error) => {
        assert.match(error.message, /unexpected, missing, or legacy policy found/i);
        assert.match(error.detail ?? "", /rn_select_all_auth/i);
        return true;
      }
    );
    await client.query("rollback");
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.query(`drop policy if exists "rn_select_all_auth" on public.release_notes`);
    client.release();
  }
});

test("ordinary authenticated users see only published history and cannot write it", async () => {
  const { adminId, memberId } = await createActors();
  const draft = await createDraft(adminId, "Private draft");
  await addCompleteItem(adminId, draft.id);
  const published = await createDraft(adminId, "Published history");
  const publishedItemId = await addCompleteItem(adminId, published.id);
  await publish(adminId, published.id);

  const archived = await createDraft(adminId, "Archived history");
  await addCompleteItem(adminId, archived.id);
  await asAuthenticated(adminId, (client) =>
    client.query("update public.release_notes set status = 'archived' where id = $1", [archived.id])
  );

  const visible = await asAuthenticated(memberId, (client) =>
    client.query(
      `select id, title from public.release_notes
       where id = any($1::uuid[]) order by title`,
      [[draft.id, published.id, archived.id]]
    )
  );
  assert.deepEqual(visible.rows, [{ id: published.id, title: "Published history" }]);

  const visibleItems = await asAuthenticated(memberId, (client) =>
    client.query(
      `select release_note_id from public.release_note_items
       where release_note_id = any($1::uuid[])`,
      [[draft.id, published.id, archived.id]]
    )
  );
  assert.deepEqual(visibleItems.rows, [{ release_note_id: published.id }]);

  await rejectsRls(() =>
    asAuthenticated(memberId, (client) =>
      client.query(
        `insert into public.release_notes (title, created_by)
         values ('Unauthorised release', $1)`,
        [memberId]
      )
    )
  );
  await assert.rejects(
    () =>
      asAuthenticated(memberId, (client) =>
        client.query(
          `insert into public.release_note_items (release_note_id, title, location, details)
           values ($1, 'Unauthorised item', 'Dashboard', 'Should not be written')`,
          [draft.id]
        )
      ),
    /row-level security|Only draft release notes can be changed/i
  );

  const update = await asAuthenticated(memberId, (client) =>
    client.query("update public.release_notes set title = 'Tampered' where id = $1", [published.id])
  );
  const parentDelete = await asAuthenticated(memberId, (client) =>
    client.query("delete from public.release_notes where id = $1", [published.id])
  );
  const itemUpdate = await asAuthenticated(memberId, (client) =>
    client.query("update public.release_note_items set details = 'Tampered' where id = $1", [publishedItemId])
  );
  const deleteResult = await asAuthenticated(memberId, (client) =>
    client.query("delete from public.release_note_items where release_note_id = $1", [published.id])
  );
  assert.equal(update.rowCount, 0);
  assert.equal(parentDelete.rowCount, 0);
  assert.equal(itemUpdate.rowCount, 0);
  assert.equal(deleteResult.rowCount, 0);

  const unchanged = await pool.query(
    `select note.title, item.details
     from public.release_notes note
     join public.release_note_items item on item.release_note_id = note.id
     where note.id = $1`,
    [published.id]
  );
  assert.deepEqual(unchanged.rows, [{
    title: "Published history",
    details: "A complete release-note item.",
  }]);
});

test("admins manage drafts but cannot change published or archived content", async () => {
  const { adminId } = await createActors();
  const deletableDraft = await createDraft(adminId, "Discarded draft");
  const deletableItemId = await addCompleteItem(adminId, deletableDraft.id);
  const draftDelete = await asAuthenticated(adminId, (client) =>
    client.query("delete from public.release_notes where id = $1 returning id", [deletableDraft.id])
  );
  assert.deepEqual(draftDelete.rows, [{ id: deletableDraft.id }]);
  const cascadedItem = await pool.query(
    "select id from public.release_note_items where id = $1",
    [deletableItemId]
  );
  assert.equal(cascadedItem.rowCount, 0);

  const draft = await createDraft(adminId);
  const itemId = await addCompleteItem(adminId, draft.id);

  const draftUpdate = await asAuthenticated(adminId, (client) =>
    client.query(
      `update public.release_notes
       set title = 'Edited draft', release_date = current_date + 1
       where id = $1 returning title`,
      [draft.id]
    )
  );
  assert.equal(draftUpdate.rows[0].title, "Edited draft");

  const itemUpdate = await asAuthenticated(adminId, (client) =>
    client.query(
      "update public.release_note_items set details = 'Edited details' where id = $1 returning id",
      [itemId]
    )
  );
  assert.equal(itemUpdate.rows[0].id, itemId);

  const publication = await publish(adminId, draft.id);
  assert.equal(publication.rows[0].status, "published");
  assert.ok(publication.rows[0].published_at);
  assert.equal(publication.rows[0].published_by, adminId);

  await assert.rejects(
    () =>
      asAuthenticated(adminId, (client) =>
        client.query(
          "update public.release_notes set title = 'Changed after publishing' where id = $1",
          [draft.id]
        )
      ),
    /returned to draft before editing/i
  );
  const publishedItemEdit = await asAuthenticated(adminId, (client) =>
    client.query("update public.release_note_items set details = 'Tampered' where id = $1", [itemId])
  );
  const publishedDelete = await asAuthenticated(adminId, (client) =>
    client.query("delete from public.release_notes where id = $1", [draft.id])
  );
  assert.equal(publishedItemEdit.rowCount, 0);
  assert.equal(publishedDelete.rowCount, 0);

  await asAuthenticated(adminId, (client) =>
    client.query("update public.release_notes set status = 'archived' where id = $1", [draft.id])
  );
  await assert.rejects(
    () =>
      asAuthenticated(adminId, (client) =>
        client.query(
          "update public.release_notes set release_date = current_date + 2 where id = $1",
          [draft.id]
        )
      ),
    /returned to draft before editing/i
  );
  const archivedItemDelete = await asAuthenticated(adminId, (client) =>
    client.query("delete from public.release_note_items where id = $1", [itemId])
  );
  const archivedDelete = await asAuthenticated(adminId, (client) =>
    client.query("delete from public.release_notes where id = $1", [draft.id])
  );
  assert.equal(archivedItemDelete.rowCount, 0);
  assert.equal(archivedDelete.rowCount, 0);

  const retainedHistory = await pool.query(
    "select status from public.release_notes where id = $1",
    [draft.id]
  );
  assert.deepEqual(retainedHistory.rows, [{ status: "archived" }]);
});

test("empty releases cannot be published and inserts cannot bypass the draft lifecycle", async () => {
  const { adminId } = await createActors();
  const attemptedPublishedInsert = await asAuthenticated(adminId, (client) =>
    client.query(
      `insert into public.release_notes
       (title, status, published_at, published_by, created_by)
       values ('Attempted direct publish', 'published', now(), $1, $1)
       returning id, status, published_at, published_by, created_by`,
      [adminId]
    )
  );
  const inserted = attemptedPublishedInsert.rows[0];
  assert.deepEqual(
    { status: inserted.status, published_at: inserted.published_at,
      published_by: inserted.published_by, created_by: inserted.created_by },
    { status: "draft", published_at: null, published_by: null, created_by: adminId }
  );

  await assert.rejects(
    () => publish(adminId, inserted.id),
    /Add at least one complete change before publishing/i
  );

  const forgedAuthor = await asAuthenticated(adminId, (client) =>
    client.query(
      `insert into public.release_notes (title, created_by)
       values ('Forged author', $1)
       returning created_by`,
      [randomUUID()]
    )
  );
  assert.equal(forgedAuthor.rows[0].created_by, adminId);
});

test("a concurrent item mutation is rejected after publication wins the parent-row lock", async () => {
  const { adminId } = await createActors();
  const draft = await createDraft(adminId, "Concurrent release");
  const itemId = await addCompleteItem(adminId, draft.id);

  const publisher    = await pool.connect();
  const itemMutator  = await pool.connect();
  try {
    await startActorTransaction(publisher, adminId);
    const publisherPid = await publisher.query("select pg_backend_pid() as pid");
    await publisher.query(
      "select id from public.release_notes where id = $1 for update",
      [draft.id]
    );

    await startActorTransaction(itemMutator, adminId);
    const mutatorApplicationName = `release-note-mutator-${randomUUID()}`;
    await itemMutator.query("select set_config('application_name', $1, true)", [mutatorApplicationName]);
    const mutation = itemMutator
      .query("update public.release_note_items set details = 'Concurrent mutation' where id = $1", [itemId])
      .then((value) => value);

    await waitForBlockedQuery(mutatorApplicationName, publisherPid.rows[0].pid);

    const publication = await publisher.query(
      "update public.release_notes set status = 'published' where id = $1 returning status",
      [draft.id]
    );
    assert.equal(publication.rows[0].status, "published");
    await publisher.query("commit");

    await assert.rejects(mutation, /Only draft release notes can be changed/i);
    await itemMutator.query("rollback").catch(() => undefined);

    const finalState = await pool.query(
      `select note.status, item.details
       from public.release_notes note
       join public.release_note_items item on item.release_note_id = note.id
       where note.id = $1`,
      [draft.id]
    );
    assert.deepEqual(finalState.rows, [{ status: "published", details: "A complete release-note item." }]);
  } finally {
    await publisher.query("rollback").catch(() => undefined);
    await itemMutator.query("rollback").catch(() => undefined);
    publisher.release();
    itemMutator.release();
  }
});

// ---------------------------------------------------------------------------
// Read-receipt and RPC tests
// ---------------------------------------------------------------------------

test("users can mark published release notes as read, only for themselves", async () => {
  const { adminId, memberId } = await createActors();
  const memberTwoId = randomUUID();
  await pool.query("insert into auth.users (id) values ($1)", [memberTwoId]);

  const draft = await createDraft(adminId, "Read-tracking draft");
  await addCompleteItem(adminId, draft.id);
  const publishedAt = await publishAndGetTimestamp(adminId, draft.id);
  const publishedId = draft.id;

  // Member one can insert a read receipt for the published note.
  // Pass read_published_at as text cast to timestamptz to preserve microseconds.
  const insert = await asAuthenticated(memberId, (client) =>
    client.query(
      `insert into public.release_note_reads (release_note_id, user_id, read_published_at)
       values ($1, $2, $3::timestamptz)
       returning release_note_id, user_id, read_published_at::text as read_published_at_text`,
      [publishedId, memberId, publishedAt]
    )
  );
  assert.equal(insert.rowCount, 1);
  assert.equal(insert.rows[0].user_id, memberId);
  assert.equal(insert.rows[0].read_published_at_text, publishedAt);

  // Member one can read their own receipt.
  const ownRead = await asAuthenticated(memberId, (client) =>
    client.query(
      `select release_note_id, user_id
       from public.release_note_reads
       where release_note_id = $1 and user_id = $2`,
      [publishedId, memberId]
    )
  );
  assert.equal(ownRead.rowCount, 1);

  // Member two cannot see member one's read receipt (read-state privacy).
  const crossRead = await asAuthenticated(memberTwoId, (client) =>
    client.query(
      `select release_note_id, user_id
       from public.release_note_reads
       where release_note_id = $1 and user_id = $2`,
      [publishedId, memberId]
    )
  );
  assert.equal(crossRead.rowCount, 0);

  // Member two cannot insert a read receipt claiming to be member one.
  await rejectsRls(() =>
    asAuthenticated(memberTwoId, (client) =>
      client.query(
        `insert into public.release_note_reads (release_note_id, user_id, read_published_at)
         values ($1, $2, $3::timestamptz)`,
        [publishedId, memberId, publishedAt]
      )
    )
  );

  // No user can mark a draft note as read.
  const draftNote = await createDraft(adminId, "Unread draft");
  await rejectsRls(() =>
    asAuthenticated(memberId, (client) =>
      client.query(
        `insert into public.release_note_reads (release_note_id, user_id, read_published_at)
         values ($1, $2, now())`,
        [draftNote.id, memberId]
      )
    )
  );

  // Wrong read_published_at (off by 1 second) must be rejected even for a published note.
  // Subtract 1 second from the text timestamp to produce a wrong value.
  const wrongTimestamp = new Date(new Date(publishedAt).getTime() - 1000).toISOString();
  await rejectsRls(() =>
    asAuthenticated(memberTwoId, (client) =>
      client.query(
        `insert into public.release_note_reads (release_note_id, user_id, read_published_at)
         values ($1, $2, $3::timestamptz)`,
        [publishedId, memberTwoId, wrongTimestamp]
      )
    )
  );

  // Cascade: deleting the published release note also removes its read receipts.
  await pool.query("delete from public.release_notes where id = $1", [publishedId]);
  const afterCascade = await pool.query(
    "select * from public.release_note_reads where release_note_id = $1",
    [publishedId]
  );
  assert.equal(afterCascade.rowCount, 0);
});

test("get_unread_release_note_count returns correct atomic count", async () => {
  const { adminId, memberId } = await createActors();

  // Two published notes.
  const noteA = await createDraft(adminId, "Unread count note A");
  await addCompleteItem(adminId, noteA.id);
  const publishedAtA = await publishAndGetTimestamp(adminId, noteA.id);

  const noteB = await createDraft(adminId, "Unread count note B");
  await addCompleteItem(adminId, noteB.id);
  const publishedAtB = await publishAndGetTimestamp(adminId, noteB.id);

  // Before any receipts, both notes are unread for memberId.
  // get_unread_release_note_count returns bigint; pg driver returns it as a string.
  const countBefore = await asAuthenticated(memberId, (client) =>
    client.query("select public.get_unread_release_note_count() as n")
  );
  const nBefore = Number(countBefore.rows[0].n);
  assert.ok(nBefore >= 2, `Expected >= 2 unread, got ${nBefore}`);

  // Mark note A as read.
  await asAuthenticated(memberId, (client) =>
    client.query(
      `insert into public.release_note_reads (release_note_id, user_id, read_published_at)
       values ($1, $2, $3::timestamptz)`,
      [noteA.id, memberId, publishedAtA]
    )
  );

  const countAfterA = await asAuthenticated(memberId, (client) =>
    client.query("select public.get_unread_release_note_count() as n")
  );
  const nAfterA = Number(countAfterA.rows[0].n);
  assert.equal(nAfterA, nBefore - 1,
    `Expected count to decrease by 1, was ${nBefore}, now ${nAfterA}`);

  // Mark note B as read.
  await asAuthenticated(memberId, (client) =>
    client.query(
      `insert into public.release_note_reads (release_note_id, user_id, read_published_at)
       values ($1, $2, $3::timestamptz)`,
      [noteB.id, memberId, publishedAtB]
    )
  );

  const countAfterBoth = await asAuthenticated(memberId, (client) =>
    client.query("select public.get_unread_release_note_count() as n")
  );
  const nAfterBoth = Number(countAfterBoth.rows[0].n);
  assert.equal(nAfterBoth, nBefore - 2,
    `Expected count to decrease by 2, was ${nBefore}, now ${nAfterBoth}`);
});

test("mark_release_notes_read atomically upserts only matching published_at", async () => {
  const { adminId, memberId } = await createActors();

  const noteC = await createDraft(adminId, "Mark RPC note C");
  await addCompleteItem(adminId, noteC.id);
  const publishedAtC = await publishAndGetTimestamp(adminId, noteC.id);

  // Stale timestamp: no receipt should be written.
  // publishedAtC is a text string; subtract 500ms to produce a wrong timestamp.
  const stale = new Date(new Date(publishedAtC).getTime() - 500).toISOString();
  const staleResult = await asAuthenticated(memberId, (client) =>
    client.query(
      "select public.mark_release_notes_read($1::jsonb) as n",
      [JSON.stringify([{ id: noteC.id, published_at: stale }])]
    )
  );
  assert.equal(staleResult.rows[0].n, 0, "Stale mark should write 0 receipts");

  // No receipt exists yet.
  const noReceipt = await pool.query(
    "select 1 from public.release_note_reads where release_note_id = $1 and user_id = $2",
    [noteC.id, memberId]
  );
  assert.equal(noReceipt.rowCount, 0);

  // Correct timestamp: receipt is written.
  // publishedAtC is already a text string from publishAndGetTimestamp.
  const correctResult = await asAuthenticated(memberId, (client) =>
    client.query(
      "select public.mark_release_notes_read($1::jsonb) as n",
      [JSON.stringify([{ id: noteC.id, published_at: publishedAtC }])]
    )
  );
  assert.equal(correctResult.rows[0].n, 1, "Correct mark should write 1 receipt");

  // Receipt now exists with the right read_published_at.
  const receipt = await pool.query(
    `select read_published_at::text as read_published_at_text
     from public.release_note_reads
     where release_note_id = $1 and user_id = $2`,
    [noteC.id, memberId]
  );
  assert.equal(receipt.rowCount, 1);
  assert.equal(receipt.rows[0].read_published_at_text, publishedAtC);

  // Calling mark again (idempotent upsert) returns 1.
  const idempotent = await asAuthenticated(memberId, (client) =>
    client.query(
      "select public.mark_release_notes_read($1::jsonb) as n",
      [JSON.stringify([{ id: noteC.id, published_at: publishedAtC }])]
    )
  );
  assert.equal(idempotent.rows[0].n, 1, "Idempotent mark should return 1");
});

test("stale expected_publication cannot mark a republished note read; current can", async () => {
  // Regression: proves that a republished note (archived then re-published)
  // invalidates any in-flight read attempt carrying the old published_at.
  const { adminId, memberId } = await createActors();

  const note = await createDraft(adminId, "Republish regression note");
  await addCompleteItem(adminId, note.id);
  const firstPublishedAt = await publishAndGetTimestamp(adminId, note.id);

  // Archive then re-publish so published_at changes.
  await asAuthenticated(adminId, (client) =>
    client.query("update public.release_notes set status = 'archived' where id = $1", [note.id])
  );
  await asAuthenticated(adminId, (client) =>
    client.query("update public.release_notes set status = 'draft' where id = $1", [note.id])
  );
  const secondPublishedAt = await publishAndGetTimestamp(adminId, note.id);
  assert.notDeepEqual(firstPublishedAt, secondPublishedAt, "Republish must produce a new published_at");

  // A stale mark with the first published_at must be rejected.
  // Both timestamps are text strings from publishAndGetTimestamp.
  const staleResult = await asAuthenticated(memberId, (client) =>
    client.query(
      "select public.mark_release_notes_read($1::jsonb) as n",
      [JSON.stringify([{ id: note.id, published_at: firstPublishedAt }])]
    )
  );
  assert.equal(staleResult.rows[0].n, 0, "Stale (pre-republish) mark should write 0 receipts");

  // A direct RLS insert with the stale timestamp must also be rejected.
  await rejectsRls(() =>
    asAuthenticated(memberId, (client) =>
      client.query(
        `insert into public.release_note_reads (release_note_id, user_id, read_published_at)
         values ($1, $2, $3::timestamptz)`,
        [note.id, memberId, firstPublishedAt]
      )
    )
  );

  // A mark with the current published_at must succeed.
  const currentResult = await asAuthenticated(memberId, (client) =>
    client.query(
      "select public.mark_release_notes_read($1::jsonb) as n",
      [JSON.stringify([{ id: note.id, published_at: secondPublishedAt }])]
    )
  );
  assert.equal(currentResult.rows[0].n, 1, "Current-version mark should write 1 receipt");

  const receipt = await pool.query(
    `select read_published_at::text as read_published_at_text
     from public.release_note_reads
     where release_note_id = $1 and user_id = $2`,
    [note.id, memberId]
  );
  assert.equal(receipt.rowCount, 1);
  assert.equal(receipt.rows[0].read_published_at_text, secondPublishedAt);

  // Re-publish once more, then re-run the migration. Idempotent backfill must
  // not advance an existing receipt to a publication the user has not read.
  await asAuthenticated(adminId, (client) =>
    client.query("update public.release_notes set status = 'archived' where id = $1", [note.id])
  );
  await asAuthenticated(adminId, (client) =>
    client.query("update public.release_notes set status = 'draft' where id = $1", [note.id])
  );
  const thirdPublishedAt = await publishAndGetTimestamp(adminId, note.id);
  assert.notDeepEqual(secondPublishedAt, thirdPublishedAt);

  const migration034 = await readFile(migration034Path, "utf8");
  await pool.query(migration034);

  const receiptAfterMigration = await pool.query(
    `select read_published_at::text as read_published_at_text
     from public.release_note_reads
     where release_note_id = $1 and user_id = $2`,
    [note.id, memberId]
  );
  assert.equal(
    receiptAfterMigration.rows[0].read_published_at_text,
    secondPublishedAt,
    "Re-running migration 034 must not mark a later publication as read"
  );

  const unreadAfterMigration = await asAuthenticated(memberId, (client) =>
    client.query("select public.get_unread_release_note_count() as n")
  );
  assert.ok(Number(unreadAfterMigration.rows[0].n) >= 1);
});

test(">200 published notes: snapshot/unread/mark RPCs handle all rows atomically without pagination", async () => {
  // Regression: proves none of the three RPCs silently paginates or skips
  // rows when more than 200 published release notes exist.
  const { adminId, memberId } = await createActors();
  const TOTAL = 205;

  // Insert TOTAL drafts in one statement, then batch-add items and publish.
  // Use pool (service-role) directly to bypass RLS overhead in bulk setup.
  const titleValues = Array.from({ length: TOTAL }, (_, i) =>
    `('Bulk note ${String(i).padStart(4, "0")}', current_date, '${adminId}'::uuid)`
  ).join(",\n    ");

  const insertedNotes = await pool.query(`
    insert into public.release_notes (title, release_date, created_by)
    values ${titleValues}
    returning id
  `);
  const noteIds = insertedNotes.rows.map((r) => r.id);

  // Add one item per note (required to publish).
  const itemValues = noteIds.map((id) =>
    `('${id}'::uuid, 0, 'Bulk item', 'Bulk', 'Bulk item details.')`
  ).join(",\n    ");
  await pool.query(`
    insert into public.release_note_items (release_note_id, order_index, title, location, details)
    values ${itemValues}
  `);

  // Publish all notes; triggers set published_at on each.
  await pool.query(`
    update public.release_notes
    set status = 'published'
    where id = any($1::uuid[])
  `, [noteIds]);

  // Fetch published_at for all notes as text to preserve microsecond precision.
  const pubRows = await pool.query(
    "select id, published_at::text as published_at from public.release_notes where id = any($1::uuid[])",
    [noteIds]
  );
  const noteMeta = pubRows.rows; // [{id, published_at: string}]

  // Unread count must be >= TOTAL.
  // get_unread_release_note_count returns bigint; pg returns it as a string.
  const unreadCount = await asAuthenticated(memberId, (client) =>
    client.query("select public.get_unread_release_note_count() as n")
  );
  const nUnreadBefore = Number(unreadCount.rows[0].n);
  assert.ok(
    nUnreadBefore >= TOTAL,
    `Expected unread count >= ${TOTAL}, got ${nUnreadBefore}`
  );

  // Build the jsonb payload for mark_release_notes_read.
  // published_at values are already text strings from the query above.
  const payload = noteMeta.map(({ id, published_at }) => ({ id, published_at }));

  const markResult = await asAuthenticated(memberId, (client) =>
    client.query(
      "select public.mark_release_notes_read($1::jsonb) as n",
      [JSON.stringify(payload)]
    )
  );
  assert.equal(
    markResult.rows[0].n,
    TOTAL,
    `Expected mark to write ${TOTAL} receipts, got ${markResult.rows[0].n}`
  );

  // All receipts persisted.
  const receiptCount = await pool.query(
    "select count(*)::integer as n from public.release_note_reads where user_id = $1 and release_note_id = any($2::uuid[])",
    [memberId, noteIds]
  );
  assert.equal(receiptCount.rows[0].n, TOTAL);

  // Unread count for these notes should now be 0 (may be > 0 for notes from
  // other tests, but those TOTAL notes are all read).
  const unreadAfter = await asAuthenticated(memberId, (client) =>
    client.query("select public.get_unread_release_note_count() as n")
  );
  const nUnreadAfter = Number(unreadAfter.rows[0].n);
  assert.ok(
    nUnreadAfter <= nUnreadBefore - TOTAL,
    `After marking ${TOTAL} notes read, expected unread to drop by ${TOTAL}; ` +
    `was ${nUnreadBefore}, now ${nUnreadAfter}`
  );

  // ------------------------------------------------------------------
  // Snapshot RPC: must return every published note including all TOTAL
  // bulk notes — no duplicates, no missing rows, correct field shape.
  // ------------------------------------------------------------------
  const snapshotResult = await asAuthenticated(memberId, (client) =>
    client.query("select public.get_published_release_notes_snapshot() as snap")
  );
  const snapshot = snapshotResult.rows[0].snap;

  assert.ok(Array.isArray(snapshot), "Snapshot must be a JSON array");

  // Collect the IDs that appear in the snapshot.
  const snapshotIds = snapshot.map((r) => r.id);

  // No duplicates.
  const uniqueIds = new Set(snapshotIds);
  assert.equal(
    uniqueIds.size,
    snapshotIds.length,
    `Snapshot contains ${snapshotIds.length - uniqueIds.size} duplicate release note ID(s)`
  );

  // All TOTAL bulk note IDs must be present.
  const noteIdSet = new Set(noteIds);
  const missingIds = noteIds.filter((id) => !uniqueIds.has(id));
  assert.equal(
    missingIds.length,
    0,
    `Snapshot is missing ${missingIds.length} of the ${TOTAL} bulk note IDs`
  );

  // Total snapshot length must be >= TOTAL (other tests may have published notes too).
  assert.ok(
    snapshot.length >= TOTAL,
    `Snapshot length ${snapshot.length} < ${TOTAL}`
  );

  // Every entry must have the required fields and a non-empty items array.
  for (const entry of snapshot) {
    assert.ok(entry.id,           `Snapshot entry missing 'id'`);
    assert.ok(entry.title,        `Snapshot entry ${entry.id} missing 'title'`);
    assert.ok(entry.release_date, `Snapshot entry ${entry.id} missing 'release_date'`);
    assert.ok(entry.published_at, `Snapshot entry ${entry.id} missing 'published_at'`);
    assert.ok(entry.created_at,   `Snapshot entry ${entry.id} missing 'created_at'`);
    assert.ok(Array.isArray(entry.items), `Snapshot entry ${entry.id} 'items' must be an array`);
    // Bulk notes each have exactly one item.
    if (noteIdSet.has(entry.id)) {
      assert.equal(
        entry.items.length,
        1,
        `Bulk note ${entry.id} should have 1 item in snapshot, got ${entry.items.length}`
      );
      const item = entry.items[0];
      assert.ok(item.id,          `Item in snapshot entry ${entry.id} missing 'id'`);
      assert.ok(item.title,       `Item in snapshot entry ${entry.id} missing 'title'`);
      assert.ok(item.location,    `Item in snapshot entry ${entry.id} missing 'location'`);
      assert.ok(item.details,     `Item in snapshot entry ${entry.id} missing 'details'`);
      assert.strictEqual(typeof item.order_index, "number",
        `Item in snapshot entry ${entry.id} 'order_index' must be a number`);
    }
  }

  // Verify UI sort order: release_date desc, published_at desc, created_at desc, id desc.
  // Check adjacent pairs among the TOTAL bulk notes (all share the same release_date
  // and were published in one batch UPDATE, so published_at and created_at will be
  // identical — only the id tiebreaker distinguishes them).
  const bulkEntries = snapshot.filter((r) => noteIdSet.has(r.id));
  assert.equal(bulkEntries.length, TOTAL, `Expected ${TOTAL} bulk entries in snapshot`);
  for (let i = 1; i < bulkEntries.length; i += 1) {
    const prev = bulkEntries[i - 1];
    const curr = bulkEntries[i];
    // release_date desc
    if (prev.release_date !== curr.release_date) {
      assert.ok(
        prev.release_date >= curr.release_date,
        `Snapshot out of order at index ${i}: release_date ${prev.release_date} < ${curr.release_date}`
      );
      continue;
    }
    // published_at desc
    if (prev.published_at !== curr.published_at) {
      assert.ok(
        prev.published_at >= curr.published_at,
        `Snapshot out of order at index ${i}: published_at ${prev.published_at} < ${curr.published_at}`
      );
      continue;
    }
    // created_at desc
    if (prev.created_at !== curr.created_at) {
      assert.ok(
        prev.created_at >= curr.created_at,
        `Snapshot out of order at index ${i}: created_at ${prev.created_at} < ${curr.created_at}`
      );
      continue;
    }
    // id desc (UUID string comparison matches byte-order for v4 UUIDs in the same session)
    assert.ok(
      prev.id >= curr.id,
      `Snapshot out of order at index ${i}: id ${prev.id} < ${curr.id}`
    );
  }

  // Snapshot RPC must exclude drafts (draft visibility regression).
  const draftNote = await createDraft(adminId, "Draft for snapshot exclusion check");
  const snapshotAfterDraft = await asAuthenticated(memberId, (client) =>
    client.query("select public.get_published_release_notes_snapshot() as snap")
  );
  const snapshotAfterDraftIds = new Set(snapshotAfterDraft.rows[0].snap.map((r) => r.id));
  assert.ok(
    !snapshotAfterDraftIds.has(draftNote.id),
    "Snapshot must not include draft release notes"
  );
});

test("034 migration is idempotent: applying it twice more leaves the same schema", async () => {
  const migration034 = await readFile(migration034Path, "utf8");
  // Applying a third and fourth time must not throw.
  await pool.query(migration034);
  await pool.query(migration034);

  const result = await pool.query(`
    select
      (select relrowsecurity from pg_class where oid = 'public.release_note_reads'::regclass) as reads_rls,
      (select count(*)::integer from pg_policy where polrelid = 'public.release_note_reads'::regclass) as read_policies,
      (select count(*)::integer from pg_indexes
       where schemaname = 'public' and tablename = 'release_note_reads') as read_indexes,
      (select count(*)::integer from pg_proc
       where proname in (
         'get_unread_release_note_count',
         'mark_release_notes_read',
         'get_published_release_notes_snapshot'
       )
         and pronamespace = 'public'::regnamespace) as rpc_count,
      (select count(*)::integer from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'release_note_reads'
         and column_name  = 'read_published_at') as has_read_published_at
  `);
  assert.deepEqual(result.rows[0], {
    reads_rls:             true,
    read_policies:         3,
    read_indexes:          2,
    rpc_count:             3,
    has_read_published_at: 1,
  });
});
