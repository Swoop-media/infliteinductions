// Strict verification of specific replaced videos:
// - ffprobe: H.264/AAC in MP4 container, faststart (moov early)
// - learner-session 206 range request via /app/files with assertions
import { createClient } from "@supabase/supabase-js";
import { execFileSync, spawnSync } from "node:child_process";
import { createWriteStream, unlinkSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anonClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const userId = process.env.TEST_USER_ID;
const bucket = "course-files";

const targets = [
  { path: "module-videos/b152f39d-b5ee-4a68-a8de-8d60117cd241/aae7cb8b-3ff8-4e03-9caa-d2d45b4298a7.mov", expectedType: "video/quicktime" },
  { path: "module-videos/7fc311db-1555-4eef-8eb2-6bc00b9c8a48/ef206b63-4ca4-485d-a05c-6f8c0be94cd6.mp4", expectedType: "video/mp4" },
  // largest replaced file, the original complaint class
  { path: "module-videos/bc022ecb-a3f6-4f6c-b184-b170556b48d3/e1e6e8e1-fcf7-4307-b2bf-3ee97e086bd1.mp4", expectedType: "video/mp4" },
];

function assert(cond, msg) { if (!cond) { console.error("ASSERT FAILED: " + msg); process.exit(1); } }

// --- ffprobe each object ---
for (const t of targets) {
  const { data: signed, error } = await admin.storage.from(bucket).createSignedUrl(t.path, 3600);
  assert(!error, "sign " + t.path + ": " + error?.message);
  const tmp = `/tmp/verify-${process.pid}.bin`;
  const res = await fetch(signed.signedUrl);
  assert(res.ok, "download " + t.path + " http " + res.status);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", tmp]).toString());
  const v = probe.streams.find(s => s.codec_type === "video");
  const a = probe.streams.find(s => s.codec_type === "audio");
  assert(v?.codec_name === "h264", t.path + " video codec is " + v?.codec_name);
  assert(!a || a.codec_name === "aac", t.path + " audio codec is " + a?.codec_name);
  assert(/mp4/.test(probe.format.format_name), t.path + " container is " + probe.format.format_name);
  assert(v.height <= 1080, t.path + " height " + v.height);
  // faststart: moov must appear before mdat in the first 1MB
  const head = execFileSync("head", ["-c", "1048576", tmp]);
  const moov = head.indexOf("moov"); const mdat = head.indexOf("mdat");
  assert(moov !== -1 && (mdat === -1 || moov < mdat), t.path + " moov not at front (moov=" + moov + " mdat=" + mdat + ")");
  // full decode check: count decode errors
  const dec = spawnSync("ffmpeg", ["-v", "error", "-i", tmp, "-f", "null", "-"], { encoding: "utf8" });
  assert(dec.status === 0, t.path + " ffmpeg decode exit " + dec.status);
  const decodeErrs = dec.stderr || "";
  unlinkSync(tmp);
  console.log("PROBE OK", t.path, `${v.codec_name}/${a?.codec_name || "no-audio"} ${v.width}x${v.height} dur=${Math.round(probe.format.duration)}s faststart=yes decode-clean=${decodeErrs.length === 0}`);
}

// --- learner session ---
const { data: u } = await admin.auth.admin.getUserById(userId);
const tempPw = "Vtest!" + Math.random().toString(36).slice(2, 12);
assert(!(await admin.auth.admin.updateUserById(userId, { password: tempPw })).error, "set temp pw");
const { data: signin, error: sErr } = await anonClient.auth.signInWithPassword({ email: u.user.email, password: tempPw });
assert(!sErr, "signin: " + sErr?.message);
const ref = new URL(url).hostname.split(".")[0];
const value = "base64-" + Buffer.from(JSON.stringify(signin.session)).toString("base64url");
const name = `sb-${ref}-auth-token`;
const cookies = [];
if (value.length <= 3180) cookies.push(`${name}=${value}`);
else for (let i = 0, n = 0; i < value.length; i += 3180, n++) cookies.push(`${name}.${n}=${value.slice(i, i + 3180)}`);
const cookieHeader = cookies.join("; ");

// ensure course assignment exists for each target's course; add temp ones if missing
const added = [];
for (const t of targets) {
  const { data: blocks } = await admin.from("module_content_blocks").select("module_id").eq("kind", "video_embed").filter("data->>url", "eq", `/app/files/${t.path}`).limit(5);
  if (!blocks?.length) { console.log("SKIP learner check (no referencing block):", t.path); t.skipLearner = true; continue; }
  const { data: mod } = await admin.from("course_modules").select("course_id").eq("id", blocks[0].module_id).single();
  const { data: existing } = await admin.from("course_assignments").select("id").eq("user_id", userId).eq("course_id", mod.course_id).limit(1);
  if (!existing?.length) {
    // mirror an existing row's shape
    const { data: sample } = await admin.from("course_assignments").select("*").limit(1).single();
    const row = { ...sample }; delete row.id; delete row.created_at; delete row.updated_at;
    row.user_id = userId; row.course_id = mod.course_id;
    const { data: ins, error: insErr } = await admin.from("course_assignments").insert(row).select("id").single();
    assert(!insErr, "temp assignment insert: " + insErr?.message);
    added.push(ins.id);
    console.log("added temp assignment for course", mod.course_id);
  }
}

const base = "http://127.0.0.1:5000";
for (const t of targets) {
  if (t.skipLearner) continue;
  const res = await fetch(`${base}/app/files/${t.path}`, { headers: { cookie: cookieHeader, range: "bytes=0-1023" } });
  const buf = Buffer.from(await res.arrayBuffer());
  assert(res.status === 206, t.path + " status " + res.status);
  assert(res.headers.get("content-type") === t.expectedType, t.path + " content-type " + res.headers.get("content-type"));
  assert(/^bytes 0-1023\/\d+$/.test(res.headers.get("content-range") || ""), t.path + " content-range " + res.headers.get("content-range"));
  assert(buf.length === 1024 && buf.slice(4, 8).toString() === "ftyp", t.path + " body/ftyp check");
  console.log("LEARNER 206 OK", t.path, res.headers.get("content-type"), res.headers.get("content-range"));
}

// cleanup temp assignments
for (const id of added) await admin.from("course_assignments").delete().eq("id", id);
if (added.length) console.log("removed", added.length, "temp assignment(s)");
console.log("ALL CHECKS PASSED");
