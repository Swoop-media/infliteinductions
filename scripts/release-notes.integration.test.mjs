/**
 * Database integration checks for the release-note lifecycle.
 *
 * The test starts a fresh local PostgreSQL cluster in the system temp
 * directory, applies the real migration, and deletes the cluster on exit.
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

const migrationPath = new URL("../app/migrations/033_release_notes.sql", import.meta.url);
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
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
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
  socketDirectory = join(clusterDirectory, "socket");
  await run(postgresBinary("initdb"), [
    "-D",
    clusterDirectory,
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
  postgres.stderr.on("data", (chunk) => {
    startupError += chunk;
  });
  postgres.once("error", (error) => {
    startupError += error.message;
  });

  const adminConnection = {
    host: socketDirectory,
    port,
    user: "postgres",
    database: "postgres",
  };

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
      await Promise.race([
        postgresExit,
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  }

  if (clusterDirectory) await rm(clusterDirectory, { recursive: true, force: true });
}

async function bootstrapReleaseNoteSchema() {
  const migration = await readFile(migrationPath, "utf8");
  await pool.query(`
    create schema auth;
    create extension if not exists pgcrypto;

    create table auth.users (
      id uuid primary key
    );

    create table public.roles (
      id uuid primary key default gen_random_uuid(),
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

  // Apply it twice so its guarded reconciliation statements stay executable.
  await pool.query(migration);
  await pool.query(`
    create policy "rn_select_all_auth"
    on public.release_notes
    for select
    to authenticated
    using (true);
  `);
  await pool.query(migration);
  await pool.query(`
    grant select, insert, update, delete on public.release_notes, public.release_note_items to authenticated;
  `);
}

async function createActors() {
  const adminId = randomUUID();
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
         set_config('request.jwt.claim.sub', $1, true),
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

async function startActorTransaction(client, userId) {
  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query("set local statement_timeout = '5s'");
  await client.query(
    `select
       set_config('request.jwt.claim.sub', $1, true),
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

test("migration enables release-note RLS, policies, and lifecycle triggers", async () => {
  const result = await pool.query(`
    select
      (select relrowsecurity from pg_class where oid = 'public.release_notes'::regclass) as notes_rls,
      (select relrowsecurity from pg_class where oid = 'public.release_note_items'::regclass) as items_rls,
      (select count(*)::integer from pg_policy where polrelid = 'public.release_notes'::regclass) as note_policies,
      (select count(*)::integer from pg_policy where polrelid = 'public.release_note_items'::regclass) as item_policies,
      (select count(*)::integer from pg_trigger
       where tgrelid = 'public.release_notes'::regclass and not tgisinternal) as note_triggers,
      (select count(*)::integer from pg_trigger
       where tgrelid = 'public.release_note_items'::regclass and not tgisinternal) as item_triggers
  `);
  assert.deepEqual(result.rows[0], {
    notes_rls: true,
    items_rls: true,
    note_policies: 4,
    item_policies: 4,
    note_triggers: 3,
    item_triggers: 2,
  });
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
  const cascadedItem = await pool.query("select id from public.release_note_items where id = $1", [deletableItemId]);
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
        client.query("update public.release_notes set title = 'Changed after publishing' where id = $1", [draft.id])
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
        client.query("update public.release_notes set release_date = current_date + 2 where id = $1", [draft.id])
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
  assert.deepEqual({
    status: inserted.status,
    published_at: inserted.published_at,
    published_by: inserted.published_by,
    created_by: inserted.created_by,
  }, {
    status: "draft",
    published_at: null,
    published_by: null,
    created_by: adminId,
  });

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

  const publisher = await pool.connect();
  const itemMutator = await pool.connect();
  try {
    await startActorTransaction(publisher, adminId);
    const publisherPid = await publisher.query("select pg_backend_pid() as pid");
    await publisher.query("select id from public.release_notes where id = $1 for update", [draft.id]);

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