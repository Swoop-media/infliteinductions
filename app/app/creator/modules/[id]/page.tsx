// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";
import VideoPlayer from '@/components/VideoPlayer';
import { ModuleType, BlockKind } from "@/lib/types/module";

export const dynamic = "force-dynamic";

type ModuleRow = {
  id: string;
  course_id: string;
  type: ModuleType;
  title: string | null;
};

type BlockRow = {
  id: string;
  module_id: string;
  kind: BlockKind;
  data: any;
  order_index: number | null;
  created_at: string | null;
};

/** Helpers */
function pageUrl(moduleId: string) {
  return `/app/creator/modules/${moduleId}`;
}
function courseUrl(courseId: string) {
  return `/app/creator/courses/${courseId}?tab=digital_training`;
}
function iconFor(kind: BlockKind) {
  switch (kind) {
    case "rich_text": return "✍️";
    case "file": return "📎";
    case "link": return "🔗";
    case "video_embed": return "🎬";
    case "request_document": return "📄";
    case "quiz_questions": return "❓";
    default: return "•";
  }
}

/** Storage signed URL (for previews) */
async function signedUrl(path: string | null | undefined) {
  "use server";
  if (!path) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.storage.from("course-files").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

/** Loaders */
async function loadModule(moduleId: string) {
  "use server";
  const supabase = await createSupabaseServer();

  const canAccess =
    (await hasRole("Course creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  if (!canAccess) redirect("/app/home?banner=not_authorised");

  const { data: mod, error } = await supabase
    .from("course_modules")
    .select("id, course_id, type, title")
    .eq("id", moduleId)
    .maybeSingle();

  if (error || !mod) throw new Error(error?.message || "Module not found");
  return mod as ModuleRow;
}

async function loadBlocks(moduleId: string) {
  "use server";
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("module_content_blocks")
    .select("id, module_id, kind, data, order_index, created_at")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BlockRow[];
}

/** Actions: create / delete / move / update blocks */
async function createBlock(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const kind = String(formData.get("kind") || "") as BlockKind;
  if (!moduleId || !kind) throw new Error("Missing fields");

  const { data: maxRow } = await supabase
    .from("module_content_blocks")
    .select("order_index")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = ((maxRow?.order_index ?? -1) as number) + 1;

  // sensible defaults
  const defaultData: any =
    kind === "rich_text" ? { text: "" } :
    kind === "link" ? { url: "", label: "" } :
    kind === "video_embed" ? { url: "", gate_seconds: null } :
    kind === "file" ? { storage_path: null, display: "" } :
    kind === "request_document" ? { label: "Please upload the requested document.", require_expiry: false } :
    kind === "quiz_questions" ? { questions: [] } : // Default for quiz questions
    {};

  const { error } = await supabase
    .from("module_content_blocks")
    .insert({
      module_id: moduleId,
      kind,
      data: defaultData,
      order_index: nextOrder,
    });

  if (error) throw new Error(error.message);

  revalidatePath(pageUrl(moduleId));
  redirect(`${pageUrl(moduleId)}?notice=block_created`);
}

async function deleteBlock(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const blockId = String(formData.get("block_id") || "");
  if (!moduleId || !blockId) throw new Error("Missing fields");

  // If it's a file block, remove the stored object
  const { data: row } = await supabase
    .from("module_content_blocks")
    .select("kind, data")
    .eq("id", blockId)
    .maybeSingle();

  if (row?.kind === "file") {
    const path: string | null = row?.data?.storage_path ?? null;
    if (path) {
      try { await supabase.storage.from("course-files").remove([path]); } catch {}
    }
  }

  const { error } = await supabase.from("module_content_blocks").delete().eq("id", blockId);
  if (error) throw new Error(error.message);

  // Renumber remaining
  const { data: rest } = await supabase
    .from("module_content_blocks")
    .select("id, order_index")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true });

  if (rest) {
    for (let i = 0; i < rest.length; i++) {
      const r = rest[i] as any;
      if (r.order_index !== i) {
        await supabase.from("module_content_blocks").update({ order_index: i }).eq("id", r.id);
      }
    }
  }

  revalidatePath(pageUrl(moduleId));
  redirect(`${pageUrl(moduleId)}?notice=block_deleted`);
}

async function moveBlock(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const blockId = String(formData.get("block_id") || "");
  const direction = String(formData.get("direction") || "up"); // up|down
  if (!moduleId || !blockId) throw new Error("Missing fields");

  const { data: cur } = await supabase
    .from("module_content_blocks")
    .select("id, order_index")
    .eq("id", blockId)
    .maybeSingle();
  if (!cur) throw new Error("Block not found");
  const curOrder = (cur as any).order_index ?? 0;

  let neighbor: any = null;
  if (direction === "up") {
    const { data } = await supabase
      .from("module_content_blocks")
      .select("id, order_index")
      .eq("module_id", moduleId)
      .lt("order_index", curOrder)
      .order("order_index", { ascending: false })
      .limit(1);
    neighbor = data?.[0] ?? null;
  } else {
    const { data } = await supabase
      .from("module_content_blocks")
      .select("id, order_index")
      .eq("module_id", moduleId)
      .gt("order_index", curOrder)
      .order("order_index", { ascending: true })
      .limit(1);
    neighbor = data?.[0] ?? null;
  }

  if (neighbor) {
    const SENTINEL = -1;
    await supabase.from("module_content_blocks").update({ order_index: SENTINEL }).eq("id", cur.id);
    await supabase.from("module_content_blocks").update({ order_index: curOrder }).eq("id", neighbor.id);
    await supabase.from("module_content_blocks").update({ order_index: neighbor.order_index }).eq("id", cur.id);
  }

  revalidatePath(pageUrl(moduleId));
  redirect(`${pageUrl(moduleId)}?notice=reordered`);
}

/** Update forms per kind */
async function updateRichText(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const blockId = String(formData.get("block_id") || "");
  const text = String(formData.get("text") || "");
  if (!moduleId || !blockId) throw new Error("Missing fields");

  const { error } = await supabase
    .from("module_content_blocks")
    .update({ data: { text } })
    .eq("id", blockId);
  if (error) throw new Error(error.message);

  revalidatePath(pageUrl(moduleId));
  redirect(`${pageUrl(moduleId)}?notice=saved`);
}

async function updateLink(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const blockId = String(formData.get("block_id") || "");
  const url = String(formData.get("url") || "");
  const label = String(formData.get("label") || "");
  if (!moduleId || !blockId) throw new Error("Missing fields");

  const { error } = await supabase
    .from("module_content_blocks")
    .update({ data: { url, label } })
    .eq("id", blockId);
  if (error) throw new Error(error.message);

  revalidatePath(pageUrl(moduleId));
  redirect(`${pageUrl(moduleId)}?notice=saved`);
}

async function updateVideo(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const blockId = String(formData.get("block_id") || "");
  const url = String(formData.get("url") || "");
  const compulsory = String(formData.get("compulsory_seconds") || "");
  const gate_seconds = compulsory === "" ? null : Number(compulsory);
  if (!moduleId || !blockId) throw new Error("Missing fields");

  const payload: any = { url };
  if (gate_seconds == null || Number.isFinite(gate_seconds)) {
    payload.gate_seconds = gate_seconds == null ? null : Math.max(0, gate_seconds);
  }

  const { error } = await supabase
    .from("module_content_blocks")
    .update({ data: payload })
    .eq("id", blockId);
  if (error) throw new Error(error.message);

  revalidatePath(pageUrl(moduleId));
  redirect(`${pageUrl(moduleId)}?notice=saved`);
}

async function uploadFileBlock(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const blockId = String(formData.get("block_id") || "");
  const display = String(formData.get("display") || "").trim().slice(0, 200);
  const file = formData.get("file") as File | null;

  if (!moduleId || !blockId || !file) throw new Error("Missing fields");

  // Remove previous if exists
  const { data: cur } = await supabase
    .from("module_content_blocks")
    .select("data")
    .eq("id", blockId)
    .maybeSingle();

  const oldPath: string | null = cur?.data?.storage_path ?? null;

  const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".") + 1) : "bin";
  const path = `module-files/${moduleId}/${crypto.randomUUID()}.${ext}`;
  const ab = await file.arrayBuffer();

  const { error: upErr } = await supabase
    .storage
    .from("course-files")
    .upload(path, new Uint8Array(ab), { upsert: false, contentType: file.type || "application/octet-stream" });
  if (upErr) throw new Error(upErr.message);

  const display_name = display || file.name;

  const { error } = await supabase
    .from("module_content_blocks")
    .update({ data: { storage_path: path, display: display_name } })
    .eq("id", blockId);
  if (error) throw new Error(error.message);

  if (oldPath && oldPath !== path) {
    try { await supabase.storage.from("course-files").remove([oldPath]); } catch {}
  }

  revalidatePath(pageUrl(moduleId));
  redirect(`${pageUrl(moduleId)}?notice=file_uploaded`);
}

async function clearFileBlock(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const blockId = String(formData.get("block_id") || "");
  if (!moduleId || !blockId) throw new Error("Missing fields");

  const { data: cur } = await supabase
    .from("module_content_blocks")
    .select("data")
    .eq("id", blockId)
    .maybeSingle();
  const oldPath: string | null = cur?.data?.storage_path ?? null;

  const { error } = await supabase
    .from("module_content_blocks")
    .update({ data: { storage_path: null, display: "" } })
    .eq("id", blockId);
  if (error) throw new Error(error.message);

  if (oldPath) {
    try { await supabase.storage.from("course-files").remove([oldPath]); } catch {}
  }

  revalidatePath(pageUrl(moduleId));
  redirect(`${pageUrl(moduleId)}?notice=saved`);
}

async function updateRequestDoc(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServer();
  const moduleId = String(formData.get("module_id") || "");
  const blockId = String(formData.get("block_id") || "");
  const label = String(formData.get("label") || "").trim().slice(0, 200) || "Please upload the requested document.";
  const require_expiry = String(formData.get("require_expiry") || "") === "on";
  if (!moduleId || !blockId) throw new Error("Missing fields");

  const { error } = await supabase
    .from("module_content_blocks")
    .update({ data: { label, require_expiry } })
    .eq("id", blockId);
  if (error) throw new Error(error.message);

  revalidatePath(pageUrl(moduleId));
  redirect(`${pageUrl(moduleId)}?notice=saved`);
}

/** Page */
export default async function ModuleEditorPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: moduleId } = await props.params;

  const mod = await loadModule(moduleId);

  // Route specialised editors
  if (mod.type === "digital_assessment_quiz") {
    redirect(`/app/creator/modules/${moduleId}/quiz`);
  }
  if (mod.type === "onsite_training" || mod.type === "onsite_assessment") {
    redirect(`/app/creator/modules/${moduleId}/onsite`);
  }

  const blocks = await loadBlocks(moduleId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{mod.title || (
            mod.type === "request_document" ? "Document Request" : "Training Module"
          )}</h1>
          <div className="text-xs text-gray-500">
            Module • {mod.type === "digital_training" ? "Digital training"
              : mod.type === "request_document" ? "Document request"
              : String(mod.type).replace("_", " ")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/learn/courses/${mod.course_id}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            prefetch={false}
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Preview as learner
          </Link>
          <Link href={courseUrl(mod.course_id)} className="rounded-md border px-3 py-1 text-sm">
            Back to course
          </Link>
        </div>
      </div>

      {/* Create block (for digital training) */}
      {mod.type === "digital_training" && (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Content blocks</h2>
              <p className="text-sm text-gray-500">
                Add text, files, videos, links, and document requests. Learner "Next" unlock can be gated by video time.
              </p>
            </div>
            <form action={createBlock} className="flex items-center gap-2">
              <input type="hidden" name="module_id" value={mod.id} />
              <select name="kind" className="rounded-md border px-3 py-2 text-sm">
                <option value="rich_text">✍️ Rich text</option>
                <option value="file">📎 File</option>
                <option value="video_embed">🎬 Video</option>
                <option value="link">🔗 Link</option>
                <option value="request_document">📤 Request upload from trainee</option>
              </select>
              <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">+ Add</button>
            </form>
          </div>
        </div>
      )}

      {/* Blocks list */}
      <section className="rounded-xl border bg-white p-4 space-y-4">
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-500">
            {mod.type === "request_document"
              ? "No configuration yet. Click “Create/Reset config” above."
              : "No content blocks yet. Add one above."}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {await Promise.all(
              blocks.map(async (b) => {
                const isFile = b.kind === "file";
                const url = isFile ? await signedUrl(b.data?.storage_path ?? null) : null;
                return (
                  <li key={b.id} className="p-4 space-y-3">
                    {/* Title + actions */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-medium">
                        {iconFor(b.kind)} {b.kind.replace("_", " ")}
                        <div className="text-xs text-gray-500">Order {b.order_index ?? 0}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <form action={moveBlock}>
                          <input type="hidden" name="module_id" value={mod.id} />
                          <input type="hidden" name="block_id" value={b.id} />
                          <input type="hidden" name="direction" value="up" />
                          <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" title="Move up">↑</button>
                        </form>
                        <form action={moveBlock}>
                          <input type="hidden" name="module_id" value={mod.id} />
                          <input type="hidden" name="block_id" value={b.id} />
                          <input type="hidden" name="direction" value="down" />
                          <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50" title="Move down">↓</button>
                        </form>
                        <form action={deleteBlock}>
                          <input type="hidden" name="module_id" value={mod.id} />
                          <input type="hidden" name="block_id" value={b.id} />
                          <button className="rounded border px-2 py-1 text-xs hover:bg-red-50" title="Delete">Delete</button>
                        </form>
                      </div>
                    </div>

                    {/* Editors per kind */}
                    {b.kind === "rich_text" && (
                      <form action={updateRichText} className="space-y-2">
                        <input type="hidden" name="module_id" value={mod.id} />
                        <input type="hidden" name="block_id" value={b.id} />
                        <label className="text-xs text-gray-600">Text</label>
                        <textarea
                          name="text"
                          defaultValue={String(b.data?.text ?? "")}
                          rows={6}
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          placeholder="Write your content…"
                        />
                        <div>
                          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Save</button>
                        </div>
                        <p className="text-xs text-gray-500">
                          Basic text is supported. (Learner view escape-renders the text for safety.)
                        </p>
                      </form>
                    )}

                    {b.kind === "link" && (
                      <form action={updateLink} className="grid gap-2 sm:grid-cols-2">
                        <input type="hidden" name="module_id" value={mod.id} />
                        <input type="hidden" name="block_id" value={b.id} />
                        <label className="grid gap-1">
                          <span className="text-xs text-gray-600">URL</span>
                          <input
                            name="url"
                            defaultValue={String(b.data?.url ?? "")}
                            className="rounded-md border px-3 py-2 text-sm"
                            placeholder="https://example.com"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs text-gray-600">Label (optional)</span>
                          <input
                            name="label"
                            defaultValue={String(b.data?.label ?? "")}
                            className="rounded-md border px-3 py-2 text-sm"
                            placeholder="Display text"
                          />
                        </label>
                        <div className="sm:col-span-2">
                          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Save</button>
                        </div>
                      </form>
                    )}

                    {b.kind === "video_embed" && (
                      <form action={updateVideo} className="grid gap-2 sm:grid-cols-2">
                        <input type="hidden" name="module_id" value={mod.id} />
                        <input type="hidden" name="block_id" value={b.id} />
                        <label className="grid gap-1 sm:col-span-2">
                          <span className="text-xs text-gray-600">Video URL</span>
                          <textarea
                            name="url"
                            rows={3}
                            defaultValue={String(b.data?.url ?? "")}
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            placeholder="Paste any video URL: YouTube, Vimeo, SharePoint, etc."
                          />
                          <span className="text-xs text-gray-500">
                            Supports: YouTube, Vimeo, SharePoint/OneDrive videos, and direct video URLs
                          </span>
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs text-gray-600">Compulsory view time (seconds)</span>
                          <input
                            type="number"
                            name="compulsory_seconds"
                            min={0}
                            defaultValue={
                              b.data?.gate_seconds == null ? "" : String(Number(b.data.gate_seconds) || 0)
                            }
                            className="rounded-md border px-3 py-2 text-sm"
                            placeholder="e.g., 90"
                          />
                        </label>
                        <div className="sm:col-span-2">
                          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Save</button>
                        </div>
                        <p className="sm:col-span-2 text-xs text-gray-500">
                          Learner “Next” button will unlock after the compulsory time across videos is reached.
                        </p>
                      </form>
                    )}

                    {b.kind === "file" && (
                      <div className="space-y-2">
                        {url ? (
                          <div className="text-sm">
                            Current file:{" "}
                            <a className="underline break-all" href={url} target="_blank">
                              {b.data?.display || "Download"}
                            </a>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">No file uploaded.</div>
                        )}

                        <div className="space-y-2">
                          <form action={uploadFileBlock} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="module_id" value={mod.id} />
                            <input type="hidden" name="block_id" value={b.id} />
                            <label className="grid gap-1">
                              <span className="text-xs text-gray-600">Display name</span>
                              <input
                                name="display"
                                defaultValue={String(b.data?.display ?? "")}
                                className="rounded-md border px-3 py-2 text-sm w-72"
                                placeholder="Shown to learners"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span className="text-xs text-gray-600">Choose file</span>
                              <input type="file" name="file" className="text-sm" />
                            </label>
                            <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Upload / Replace</button>
                          </form>
                          {b.data?.storage_path && (
                            <form action={clearFileBlock}>
                              <input type="hidden" name="module_id" value={mod.id} />
                              <input type="hidden" name="block_id" value={b.id} />
                              <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Remove</button>
                            </form>
                          )}
                        </div>
                      </div>
                    )}

                    {b.kind === "request_document" && (
                      <form action={updateRequestDoc} className="grid gap-2 sm:grid-cols-2">
                        <input type="hidden" name="module_id" value={mod.id} />
                        <input type="hidden" name="block_id" value={b.id} />
                        <label className="grid gap-1 sm:col-span-2">
                          <span className="text-xs text-gray-600">Prompt shown to the learner</span>
                          <input
                            name="label"
                            defaultValue={String(b.data?.label ?? "Please upload the requested document.")}
                            className="rounded-md border px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="require_expiry"
                            defaultChecked={!!b.data?.require_expiry}
                          />
                          Require expiry date
                        </label>
                        <div className="sm:col-span-2">
                          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50">Save</button>
                        </div>
                      </form>
                    )}

                    {b.kind === "quiz_questions" && (
                      <div>
                        <h3 className="text-md font-semibold mb-2">Quiz Questions</h3>
                        {/* Placeholder for quiz question editor */}
                        <p className="text-sm text-gray-500">Quiz editor will go here.</p>
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </section>
    </div>
  );
}