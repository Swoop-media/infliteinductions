/**
 * Database checks for the immutable course-version retry transition.
 *
 * This starts a temporary local PostgreSQL cluster and executes the exact
 * course-version protection trigger from migration 032. It never connects to
 * Supabase or reads application database environment variables.
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

const migrationPath = new URL("../app/migrations/032_immutable_training_history.sql", import.meta.url);
const testDatabase = "course_version_logs_integration";
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
  clusterDirectory = await mkdtemp(join(tmpdir(), "course-version-logs-pg-"));
  socketDirectory = join(clusterDirectory, "socket");
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

async function bootstrapCourseVersions() {
  const migration = await readFile(migrationPath, "utf8");
  const triggerStart = migration.indexOf(
    "create or replace function public.protect_published_course_version()"
  );
  const triggerEnd = migration.indexOf("notify pgrst, 'reload schema';", triggerStart);
  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart, "migration 032 protection trigger was found");

  await pool.query(`
    create extension if not exists pgcrypto;
    create table public.course_versions (
      id uuid primary key default gen_random_uuid(),
      course_id uuid not null,
      version_number integer not null check (version_number > 0),
      title text not null,
      description text,
      snapshot jsonb not null,
      status text not null default 'published'
        check (status in ('publishing', 'published', 'superseded')),
      change_notes text,
      published_at timestamptz not null default now(),
      published_by uuid,
      created_at timestamptz not null default now(),
      unique (course_id, version_number)
    );
  `);
  await pool.query(migration.slice(triggerStart, triggerEnd));
}

before(async () => {
  await startTemporaryDatabase();
  await bootstrapCourseVersions();
});

after(async () => {
  await stopTemporaryDatabase();
});

test("an interrupted release resumes by changing only status and retains its original log details", async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const courseId = randomUUID();
    const publisherId = randomUUID();
    const publishedAt = "2026-08-20T01:02:03.000Z";
    const inserted = await client.query(
      `insert into public.course_versions
        (course_id, version_number, title, snapshot, status, change_notes, published_at, published_by)
       values ($1, 2, 'Emergency response', '{}'::jsonb, 'publishing', $2, $3, $4)
       returning id`,
      [courseId, "Updated evacuation procedure", publishedAt, publisherId]
    );

    const resumed = await client.query(
      `update public.course_versions
       set status = 'published'
       where id = $1
       returning status, change_notes, published_at, published_by`,
      [inserted.rows[0].id]
    );

    assert.deepEqual(resumed.rows[0], {
      status: "published",
      change_notes: "Updated evacuation procedure",
      published_at: new Date(publishedAt),
      published_by: publisherId,
    });
    await client.query("rollback");
  } finally {
    client.release();
  }
});

test("migration 032 rejects changing log attribution even before publication", async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const inserted = await client.query(
      `insert into public.course_versions
        (course_id, version_number, title, snapshot, status, change_notes, published_by)
       values ($1, 2, 'First aid', '{}'::jsonb, 'publishing', 'Original summary', $2)
       returning id`,
      [randomUUID(), randomUUID()]
    );

    await assert.rejects(
      client.query(
        "update public.course_versions set change_notes = 'Replacement summary' where id = $1",
        [inserted.rows[0].id]
      ),
      /Course version definitions are immutable/
    );
    await client.query("rollback");
  } finally {
    client.release();
  }
});