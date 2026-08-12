// Scan course-files/module-videos for files > 100MB
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing SUPABASE env"); process.exit(1); }
const sb = createClient(url, key);

const bucket = "course-files";
const results = [];

async function listAll(prefix) {
  let offset = 0;
  const out = [];
  while (true) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(prefix + ": " + error.message);
    out.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

const dirs = await listAll("module-videos");
for (const d of dirs) {
  if (d.id) {
    // file directly under module-videos
    if (d.metadata?.size > 100 * 1024 * 1024) results.push({ path: `module-videos/${d.name}`, size: d.metadata.size, updated_at: d.updated_at });
    continue;
  }
  const files = await listAll(`module-videos/${d.name}`);
  for (const f of files) {
    if (f.id && f.metadata?.size > 100 * 1024 * 1024)
      results.push({ path: `module-videos/${d.name}/${f.name}`, size: f.metadata.size, updated_at: f.updated_at });
  }
}

results.sort((a, b) => b.size - a.size);
console.log(JSON.stringify(results, null, 2));
console.error(`Total: ${results.length} files, ${(results.reduce((s, r) => s + r.size, 0) / 1e9).toFixed(2)} GB`);
