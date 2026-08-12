// Verify 206-range playback of compressed videos through /app/files as a real learner.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.TEST_USER_ID;
const admin = createClient(url, service);

// 1. Find courses the test user is assigned to
const { data: assigns, error: aErr } = await admin
  .from("course_assignments").select("course_id").eq("user_id", userId).limit(50);
if (aErr) throw aErr;
const courseIds = [...new Set(assigns.map(a => a.course_id))];
console.log("assigned courses:", courseIds.length);

// 2. Find a video block in those courses pointing at a compressed module-videos file
const { data: mods } = await admin.from("course_modules").select("id").in("course_id", courseIds);
const modIds = mods.map(m => m.id);
let samplePath = null;
for (let i = 0; i < modIds.length && !samplePath; i += 100) {
  const { data: blocks } = await admin
    .from("module_content_blocks").select("data,kind").in("module_id", modIds.slice(i, i + 100)).eq("kind", "video_embed").limit(500);
  for (const b of blocks || []) {
    const u = b.data?.url || "";
    const m = u.match(/^\/app\/files\/(module-videos\/.+\.(mp4|mov|webm|m4v))$/);
    if (m) { samplePath = m[1]; break; }
  }
}
if (!samplePath) { console.error("No assigned video found for test user"); process.exit(1); }
console.log("sample video:", samplePath);

// 3. Mint session: set temp password on test user, sign in
const { data: u } = await admin.auth.admin.getUserById(userId);
const email = u.user.email;
const tempPw = "Vtest!" + Math.random().toString(36).slice(2, 12);
const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password: tempPw });
if (pwErr) throw pwErr;
const anonClient = createClient(url, anon);
const { data: signin, error: sErr } = await anonClient.auth.signInWithPassword({ email, password: tempPw });
if (sErr) throw sErr;
const session = signin.session;
const ref = new URL(url).hostname.split(".")[0];
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
// chunk like @supabase/ssr (3180 chars)
const name = `sb-${ref}-auth-token`;
const cookies = [];
if (value.length <= 3180) cookies.push(`${name}=${value}`);
else for (let i = 0, n = 0; i < value.length; i += 3180, n++) cookies.push(`${name}.${n}=${value.slice(i, i + 3180)}`);
const cookieHeader = cookies.join("; ");

// 4. Range requests against the dev server
const base = "http://127.0.0.1:5000";
const target = `${base}/app/files/${samplePath}`;
for (const range of ["bytes=0-1023", "bytes=1000000-1999999"]) {
  const res = await fetch(target, { headers: { cookie: cookieHeader, range } });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(range, "->", res.status, res.headers.get("content-type"),
    "content-range:", res.headers.get("content-range"), "bytes:", buf.length,
    "head:", buf.slice(0, 12).toString("hex"));
}
// full GET headers only
const res = await fetch(target, { headers: { cookie: cookieHeader, range: "bytes=0-" } });
console.log("bytes=0- ->", res.status, "content-length:", res.headers.get("content-length"), "accept-ranges:", res.headers.get("accept-ranges"));
res.body?.cancel();
