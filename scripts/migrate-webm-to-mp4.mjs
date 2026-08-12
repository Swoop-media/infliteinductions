// The batch re-encoded this .webm to MP4 bytes but left it at the .webm path,
// where the file proxy would serve it as video/webm (unplayable on iOS).
// Migrate the object to an .mp4 path and update referencing video blocks.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const bucket = "course-files";
const oldPath = "module-videos/7fc311db-1555-4eef-8eb2-6bc00b9c8a48/ef206b63-4ca4-485d-a05c-6f8c0be94cd6.webm";
const newPath = oldPath.replace(/\.webm$/, ".mp4");

// 1. Copy object to .mp4 path (keep .webm until DB is updated)
const { error: cpErr } = await sb.storage.from(bucket).copy(oldPath, newPath);
if (cpErr && !/already exists/i.test(cpErr.message)) throw new Error("copy: " + cpErr.message);
console.log("copied ->", newPath);

// 2. Update all video_embed blocks referencing the old proxy URL
const oldUrl = `/app/files/${oldPath}`;
const newUrl = `/app/files/${newPath}`;
const { data: blocks, error: qErr } = await sb
  .from("module_content_blocks").select("id,data").eq("kind", "video_embed")
  .filter("data->>url", "eq", oldUrl).limit(200);
if (qErr) throw qErr;
console.log("blocks referencing old url:", blocks.length);
for (const b of blocks) {
  const { error: uErr } = await sb.from("module_content_blocks")
    .update({ data: { ...b.data, url: newUrl } }).eq("id", b.id);
  if (uErr) throw new Error("update block " + b.id + ": " + uErr.message);
  console.log("updated block", b.id);
}

// Also check file blocks by storage_path / legacy file_id just in case
for (const col of ["storage_path", "file_id"]) {
  const { data: fb } = await sb.from("module_content_blocks").select("id,data").eq("kind", "file")
    .filter(`data->>${col}`, "eq", oldPath).limit(200);
  for (const b of fb || []) {
    const { error: uErr } = await sb.from("module_content_blocks")
      .update({ data: { ...b.data, [col]: newPath } }).eq("id", b.id);
    if (uErr) throw new Error("update file block " + b.id + ": " + uErr.message);
    console.log("updated file block", b.id, col);
  }
}

// 3. Verify no remaining references, then remove the .webm object
const { data: remain } = await sb.from("module_content_blocks").select("id")
  .eq("kind", "video_embed").filter("data->>url", "eq", oldUrl).limit(10);
if ((remain || []).length) throw new Error("references remain, not deleting old object");
const { error: rmErr } = await sb.storage.from(bucket).remove([oldPath]);
if (rmErr) throw new Error("remove old: " + rmErr.message);
console.log("removed old .webm object. Done.");
