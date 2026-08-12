// Download > re-encode (H.264 1080p CRF23 AAC +faststart) > upsert at same path.
// Sequential, largest first. Temp files in /tmp, deleted after each file.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, createWriteStream, unlinkSync, existsSync, statSync, readFileSync as rf } from "node:fs";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);
const bucket = "course-files";

// Files replaced by this batch after this cutoff are skipped on re-scan resume.
const CUTOFF = "2026-08-12T04:15:00Z";
const list = JSON.parse(readFileSync(".video-compress/large-videos.json", "utf8"))
  .filter(f => !(f.updated_at && f.updated_at > CUTOFF));
const reportPath = ".video-compress/compress-report.json";
// Resume support: skip files already handled in a previous run
let report = [];
try { report = JSON.parse(readFileSync(reportPath, "utf8")); } catch {}
const doneSet = new Set(report.filter(r => r.status !== "failed").map(r => r.path));
report = report.filter(r => r.status !== "failed");

import { createReadStream } from "node:fs";

async function uploadStream(path, file, size) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data: su, error: suErr } = await sb.storage
        .from(bucket)
        .createSignedUploadUrl(path, { upsert: true });
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

function cleanup(...paths) {
  for (const p of paths) { try { if (existsSync(p)) unlinkSync(p); } catch {} }
}

for (let i = 0; i < list.length; i++) {
  const { path, size } = list[i];
  const tag = `[${i + 1}/${list.length}]`;
  if (doneSet.has(path)) { console.log(`${tag} already done, skipping`); continue; }
  const ext = path.split(".").pop().toLowerCase();
  const inFile = `/tmp/in-${process.pid}.${ext}`;
  const outFile = `/tmp/out-${process.pid}.mp4`;
  cleanup(inFile, outFile);
  try {
    console.log(`${tag} ${path} (${(size / 1e6).toFixed(0)} MB) downloading...`);
    const { data: signed, error: sErr } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
    if (sErr) throw new Error("sign: " + sErr.message);
    const res = await fetch(signed.signedUrl);
    if (!res.ok) throw new Error("download http " + res.status);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(inFile));

    console.log(`${tag} encoding...`);
    execFileSync("ffmpeg", [
      "-y", "-i", inFile,
      "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      outFile,
    ], { stdio: ["ignore", "ignore", "pipe"] });

    const newSize = statSync(outFile).size;
    if (newSize <= 0) throw new Error("empty output");
    if (newSize >= size) {
      console.log(`${tag} SKIP upload: output not smaller (${(newSize / 1e6).toFixed(0)} MB)`);
      report.push({ path, before: size, after: size, status: "skipped-not-smaller" });
    } else {
      console.log(`${tag} uploading ${(newSize / 1e6).toFixed(0)} MB...`);
      // NB: path keeps its original extension even though output is mp4 —
      // ffmpeg output is mp4 container; for .mov/.mp4/.m4v paths mp4 bytes are fine
      // (player mime by extension: mov->video/quicktime still plays H.264/AAC mp4).
      await uploadStream(path, outFile, newSize);
      report.push({ path, before: size, after: newSize, status: "replaced" });
      console.log(`${tag} DONE ${(size / 1e6).toFixed(0)} -> ${(newSize / 1e6).toFixed(0)} MB`);
    }
  } catch (e) {
    console.error(`${tag} FAILED ${path}: ${e.message}`);
    report.push({ path, before: size, status: "failed", error: String(e.message).slice(0, 300) });
  } finally {
    cleanup(inFile, outFile);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
}

const done = report.filter(r => r.status === "replaced");
const totBefore = done.reduce((s, r) => s + r.before, 0);
const totAfter = done.reduce((s, r) => s + r.after, 0);
console.log(`\nReplaced ${done.length}/${list.length}. ${(totBefore / 1e9).toFixed(2)} GB -> ${(totAfter / 1e9).toFixed(2)} GB`);
