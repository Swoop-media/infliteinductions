// Second pass for files still >300MB after the first CRF23 batch.
// Two-pass H.264 with per-file bitrate targeting ~280MB, upsert at same path.
// State/report in .video-compress/ (workspace, resumable).
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, createWriteStream, createReadStream, unlinkSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing SUPABASE env"); process.exit(1); }
const sb = createClient(url, key);
const bucket = "course-files";

const TARGET_BYTES = 280 * 1e6; // safely under the 300MB cap
const targets = [
  "module-videos/bc022ecb-a3f6-4f6c-b184-b170556b48d3/e1e6e8e1-fcf7-4307-b2bf-3ee97e086bd1.mp4",
  "module-videos/bc022ecb-a3f6-4f6c-b184-b170556b48d3/44dcee59-ba56-423e-84ca-34d7842eb0e3.mp4",
  "module-videos/1b5b2840-941d-4b6c-b847-feaa25a5731b/c7a31d05-44fa-4ad0-a7f9-530a9e5f4d55.mp4",
];

const reportPath = ".video-compress/second-pass-report.json";
let report = [];
try { report = JSON.parse(readFileSync(reportPath, "utf8")); } catch {}
const doneSet = new Set(report.filter(r => r.status === "replaced").map(r => r.path));
report = report.filter(r => r.status === "replaced");

async function uploadStream(path, file, size) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data: su, error: suErr } = await sb.storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
      if (suErr) throw new Error("signedUploadUrl: " + suErr.message);
      const res = await fetch(su.signedUrl, {
        method: "PUT",
        headers: {
          "content-type": "video/mp4",
          "content-length": String(size),
          "x-upsert": "true",
          authorization: `Bearer ${key}`,
        },
        body: Readable.toWeb(createReadStream(file)),
        duplex: "half",
      });
      if (!res.ok) throw new Error(`upload http ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return;
    } catch (e) {
      lastErr = e;
      console.error(`upload attempt ${attempt} failed: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }
  throw new Error("upload: " + lastErr.message);
}

function cleanup(...paths) { for (const p of paths) { try { if (existsSync(p)) unlinkSync(p); } catch {} } }

for (let i = 0; i < targets.length; i++) {
  const path = targets[i];
  const tag = `[${i + 1}/${targets.length}]`;
  if (doneSet.has(path)) { console.log(`${tag} already done, skipping`); continue; }
  const inFile = `/tmp/sp-in-${process.pid}.mp4`;
  const outFile = `/tmp/sp-out-${process.pid}.mp4`;
  const passLog = `/tmp/sp-pass-${process.pid}`;
  cleanup(inFile, outFile);
  try {
    const { data: signed, error: sErr } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
    if (sErr) throw new Error("sign: " + sErr.message);
    console.log(`${tag} ${path} downloading...`);
    const res = await fetch(signed.signedUrl);
    if (!res.ok) throw new Error("download http " + res.status);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(inFile));
    const before = statSync(inFile).size;

    const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", inFile]).toString());
    if (!(dur > 0)) throw new Error("bad duration " + dur);
    const audioKbps = 96;
    let vKbps = Math.floor((TARGET_BYTES * 8) / dur / 1000) - audioKbps - 50; // 50k mux overhead margin
    if (vKbps < 500) vKbps = 500;
    console.log(`${tag} dur=${Math.round(dur)}s -> video ${vKbps}k, two-pass encoding...`);

    const common = ["-y", "-i", inFile, "-c:v", "libx264", "-preset", "medium", "-b:v", `${vKbps}k`, "-maxrate", `${Math.floor(vKbps * 1.3)}k`, "-bufsize", `${vKbps * 2}k`, "-passlogfile", passLog];
    execFileSync("ffmpeg", [...common, "-pass", "1", "-an", "-f", "mp4", "/dev/null"], { stdio: ["ignore", "ignore", "pipe"] });
    execFileSync("ffmpeg", [...common, "-pass", "2", "-c:a", "aac", "-b:a", `${audioKbps}k`, "-movflags", "+faststart", outFile], { stdio: ["ignore", "ignore", "pipe"] });

    const newSize = statSync(outFile).size;
    if (newSize <= 0) throw new Error("empty output");
    if (newSize >= before) {
      console.log(`${tag} SKIP upload: output not smaller (${(newSize / 1e6).toFixed(0)} MB)`);
      report.push({ path, before, after: before, status: "skipped-not-smaller" });
    } else {
      console.log(`${tag} uploading ${(newSize / 1e6).toFixed(0)} MB...`);
      await uploadStream(path, outFile, newSize);
      report.push({ path, before, after: newSize, status: "replaced" });
      console.log(`${tag} DONE ${(before / 1e6).toFixed(0)} -> ${(newSize / 1e6).toFixed(0)} MB`);
    }
  } catch (e) {
    console.error(`${tag} FAILED ${path}: ${e.message}`);
    report.push({ path, before: 0, status: "failed", error: String(e.message).slice(0, 300) });
  } finally {
    cleanup(inFile, outFile, passLog + "-0.log", passLog + "-0.log.mbtree");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
}
console.log("second pass complete");
