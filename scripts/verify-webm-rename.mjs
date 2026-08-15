// Task 91: end-to-end verification of the .webm -> .mp4 rename path in the
// video compression worker. Uploads a real >100MB VP8 .webm as the test
// creator through the real API routes, then verifies the queue, repoint,
// old-object removal, and 206 playback. `check` exits nonzero unless EVERY
// required condition holds (exit 2 = still running, retry later).
//
// Usage:
//   node --env-file=.env --env-file=.env.local scripts/verify-webm-rename.mjs setup
//   node --env-file=.env --env-file=.env.local scripts/verify-webm-rename.mjs check
//   node --env-file=.env --env-file=.env.local scripts/verify-webm-rename.mjs cleanup
//
// Auth: mints a short-lived session for TEST_USER_ID by setting a temporary
// random password (the established pattern in scripts/verify-*.mjs). The
// session is never written to disk, and `cleanup` re-randomizes the password
// so the temporary one cannot be reused.
//
// State (IDs only — never tokens) is kept in scripts/.verify-webm-rename-state.json
// (gitignored) and removed by cleanup.
import { createClient } from "@supabase/supabase-js";
import { createReadStream, readFileSync, writeFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.TEST_USER_ID;
const admin = createClient(url, service);
const base = "http://127.0.0.1:5000";
const STATE = "scripts/.verify-webm-rename-state.json";
const WEBM = "/tmp/test-large.webm";

const cmd = process.argv[2] || "setup";
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

function randomPw() {
  return "Vtest!" + randomBytes(18).toString("base64url");
}

/** Mint a fresh session cookie in memory. Never persisted. */
async function mintCookie() {
  const { data: u, error: uErr } = await admin.auth.admin.getUserById(userId);
  if (uErr) throw uErr;
  const tempPw = randomPw();
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password: tempPw });
  if (pwErr) throw pwErr;
  const anonClient = createClient(url, anonKey);
  const { data: signin, error: sErr } = await anonClient.auth.signInWithPassword({ email: u.user.email, password: tempPw });
  if (sErr) throw sErr;
  const ref = new URL(url).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(signin.session)).toString("base64url");
  const cookies = [];
  if (value.length <= 3180) cookies.push(`${name}=${value}`);
  else for (let i = 0, n = 0; i < value.length; i += 3180, n++) cookies.push(`${name}.${n}=${value.slice(i, i + 3180)}`);
  return cookies.join("; ");
}

async function scramblePassword() {
  const { error } = await admin.auth.admin.updateUserById(userId, { password: randomPw() });
  console.log("test user password re-randomized", error?.message || "ok");
}

async function ensureCreatorRole() {
  const { data: isCreator, error } = await admin.rpc("has_role", { uid: userId, role_name: "Course Creators" });
  if (error) throw error;
  if (isCreator) { console.log("test user already has Course Creators role"); return; }
  const { data: role, error: rErr } = await admin.from("roles").select("id").eq("name", "Course Creators").maybeSingle();
  if (rErr || !role) throw new Error("roles lookup: " + (rErr?.message || "no Course Creators role row"));
  const { error: gErr } = await admin.from("user_roles").insert({ user_id: userId, role_id: role.id });
  if (gErr) throw new Error("grant role: " + gErr.message);
  state.grantedRoleId = role.id; save();
  console.log("granted temporary Course Creators role");
}

if (cmd === "setup") {
  const size = statSync(WEBM).size;
  if (size <= 100 * 1024 * 1024) throw new Error("test .webm must be >100MB to trigger compression");
  console.log("webm size:", (size / 1e6).toFixed(1), "MB");
  await ensureCreatorRole();

  // Test course/module/block owned by the test user (draft, never assigned)
  const { data: course, error: cErr } = await admin.from("courses")
    .insert({ title: "ZZ TEST task91 webm rename (delete me)", created_by: userId, status: "draft" })
    .select("id").single();
  if (cErr) throw new Error("course insert: " + cErr.message);
  state.courseId = course.id; save();
  const { data: mod, error: mErr } = await admin.from("course_modules")
    .insert({ course_id: course.id, title: "test module", position: 1 })
    .select("id").single();
  if (mErr) throw new Error("module insert: " + mErr.message);
  state.moduleId = mod.id; save();
  const { data: block, error: bErr } = await admin.from("module_content_blocks")
    .insert({ module_id: mod.id, kind: "video_embed", order_index: 1, data: {} })
    .select("id").single();
  if (bErr) throw new Error("block insert: " + bErr.message);
  state.blockId = block.id; save();
  console.log("course/module/block:", course.id, mod.id, block.id);

  const cookie = await mintCookie();

  // 1) signed upload URL via real route
  let res = await fetch(`${base}/api/upload-signed-url`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fileName: "test-large.webm", fileSize: size, contentType: "video/webm", moduleId: mod.id, uploadType: "video" }),
  });
  const signed = await res.json();
  if (!res.ok) throw new Error("upload-signed-url: " + res.status + " " + JSON.stringify(signed));
  console.log("signed path:", signed.path);
  state.webmPath = signed.path; save();

  // 2) streamed PUT of the file
  res = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "video/webm", "content-length": String(size), "x-upsert": "true" },
    body: Readable.toWeb(createReadStream(WEBM)),
    duplex: "half",
    signal: AbortSignal.timeout(20 * 60_000),
  });
  const putText = await res.text();
  if (!res.ok) throw new Error("storage PUT: " + res.status + " " + putText.slice(0, 300));
  console.log("storage PUT ok");

  // 3) upload-complete via real route (queues compression + kicks worker)
  res = await fetch(`${base}/api/upload-complete`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ moduleId: mod.id, blockId: block.id, storagePath: signed.path, displayName: "task91 test webm", uploadType: "video" }),
  });
  const complete = await res.json();
  console.log("upload-complete:", res.status, JSON.stringify(complete));
  if (!res.ok || !complete.compressionQueued) throw new Error("expected compressionQueued=true");
  console.log("SETUP OK — job queued; run `check` to poll");
}

if (cmd === "check") {
  if (!state.webmPath || !state.blockId) throw new Error("no state — run setup first");
  const { data: jobs, error } = await admin.from("video_compression_jobs")
    .select("*").eq("storage_path", state.webmPath).order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  const job = jobs?.[0];
  if (!job) { console.log("no job row yet"); process.exit(2); }
  console.log("job:", job.status, "attempts:", job.attempts, "error:", job.error,
    "orig:", job.original_bytes, "out:", job.output_bytes);
  if (job.status === "queued" || job.status === "processing") process.exit(2);

  const failures = [];
  const assert = (cond, label) => {
    console.log((cond ? "PASS" : "FAIL") + " — " + label);
    if (!cond) failures.push(label);
  };

  assert(job.status === "done", `job status is done (got: ${job.status}${job.error ? ", error: " + job.error : ""})`);
  assert(typeof job.output_bytes === "number" && job.output_bytes > 0 && job.output_bytes < job.original_bytes,
    `output smaller than original (${job.output_bytes} < ${job.original_bytes})`);

  // block repointed to sibling .mp4?
  const mp4Path = state.webmPath.replace(/\.webm$/i, ".mp4");
  const { data: block, error: blkErr } = await admin.from("module_content_blocks").select("data").eq("id", state.blockId).single();
  if (blkErr) throw blkErr;
  assert(block?.data?.url === `/app/files/${mp4Path}`,
    `block data.url repointed to /app/files/${mp4Path} (got: ${block?.data?.url})`);

  // old .webm removed, new .mp4 present?
  const folder = state.webmPath.split("/").slice(0, -1).join("/");
  const { data: list, error: listErr } = await admin.storage.from("course-files").list(folder, { limit: 100 });
  if (listErr) throw listErr;
  const names = (list || []).map((o) => o.name);
  console.log("storage objects in folder:", names.join(", ") || "(none)");
  assert(!names.includes(state.webmPath.split("/").pop()), "old .webm object removed from storage");
  assert(names.includes(mp4Path.split("/").pop()), "new .mp4 object present in storage");

  // playback: 206 + video/mp4 + valid content-range + ftyp magic via file proxy
  const cookie = await mintCookie();
  const res = await fetch(`${base}/app/files/${mp4Path}`, { headers: { cookie, range: "bytes=0-1023" } });
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";
  const contentRange = res.headers.get("content-range") || "";
  console.log("playback:", res.status, contentType, "content-range:", contentRange,
    "magic:", buf.subarray(4, 8).toString("latin1"));
  assert(res.status === 206, `playback returns 206 (got: ${res.status})`);
  assert(contentType === "video/mp4", `content-type is video/mp4 (got: ${contentType})`);
  assert(/^bytes 0-1023\/\d+$/.test(contentRange), `content-range is bytes 0-1023/<total> (got: ${contentRange})`);
  assert(buf.length === 1024, `body is 1024 bytes (got: ${buf.length})`);
  assert(buf.subarray(4, 8).toString("latin1") === "ftyp", "response bytes start with MP4 ftyp magic");

  if (failures.length) {
    console.error(`\nVERIFICATION FAILED (${failures.length} assertion(s)):\n- ` + failures.join("\n- "));
    process.exit(1);
  }
  console.log("\nALL CHECKS PASSED — .webm→MP4 rename path verified end-to-end");
}

if (cmd === "cleanup") {
  const folder = state.webmPath?.split("/").slice(0, -1).join("/");
  if (folder) {
    const { data: list } = await admin.storage.from("course-files").list(folder, { limit: 100 });
    const paths = (list || []).map((o) => `${folder}/${o.name}`);
    if (paths.length) {
      const { error } = await admin.storage.from("course-files").remove(paths);
      console.log("removed storage:", paths.join(", "), error?.message || "ok");
    }
  }
  if (state.webmPath) {
    const { error } = await admin.from("video_compression_jobs").delete().eq("storage_path", state.webmPath);
    console.log("job rows deleted", error?.message || "ok");
  }
  if (state.blockId) await admin.from("module_content_blocks").delete().eq("id", state.blockId);
  if (state.moduleId) await admin.from("course_modules").delete().eq("id", state.moduleId);
  if (state.courseId) {
    const { error } = await admin.from("courses").delete().eq("id", state.courseId);
    console.log("course deleted", error?.message || "ok");
  }
  if (state.grantedRoleId) {
    const { error } = await admin.from("user_roles").delete().eq("user_id", userId).eq("role_id", state.grantedRoleId);
    console.log("temp role revoked", error?.message || "ok");
  }
  await scramblePassword();
  if (existsSync(STATE)) unlinkSync(STATE);
  console.log("cleanup done");
}
