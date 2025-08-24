// app/app/learn/modules/[id]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type BlockKind = "rich_text" | "link" | "video_embed" | "file" | "request_document";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Normalize common share/watch links to proper embed URLs (prevents 404 in iframes)
function toEmbedUrl(raw: string) {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    // YouTube
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        if (v) return `https://www.youtube.com/embed/${v}`;
      }
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2];
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    // Vimeo
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

/** Build proxy URL for private storage */
function fileProxy(path: string) {
  return `/app/files/${encodeURIComponent(path)}`;
}

function isImagePath(p: string) {
  const ext = p.split(".").pop()?.toLowerCase();
  return !!ext && ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext);
}

async function BlockView({ block }: { block: any }) {
  "use server";
  const kind = block.kind as BlockKind;
  const data = (block.data || {}) as any;

  if (kind === "rich_text") {
    const text = String(data.text ?? "");
    return (
      <div
        className="prose max-w-none whitespace-pre-wrap text-sm"
        dangerouslySetInnerHTML={{ __html: escapeHtml(text) }}
      />
    );
  }

  if (kind === "link") {
    const url = String(data.url ?? "");
    const label = String((data.label ?? url) || "Link");
    return (
      <p className="text-sm">
        🔗{" "}
        <a href={url} target="_blank" className="underline break-all">
          {label}
        </a>
      </p>
    );
  }

  if (kind === "video_embed") {
    const raw = String(data.url ?? "");
    const url = toEmbedUrl(raw);
    return url ? (
      <div className="aspect-video w-full overflow-hidden rounded-md border">
        <iframe
          src={url}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    ) : (
      <p className="text-sm text-gray-500">No video URL provided.</p>
    );
  }

  if (kind === "file") {
    const display = String(data.filename ?? data.display ?? "Download");
    const path: string | null = data.file_id ?? data.storage_path ?? null;

    if (!path) {
      return <p className="text-sm text-gray-500">File not available.</p>;
    }

    const href = fileProxy(path);

    // If it looks like an image, render inline + a small “open” link.
    if (isImagePath(path)) {
      return (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={display}
            className="max-h-[480px] w-auto rounded-md border object-contain"
          />
          <figcaption className="text-xs text-gray-500">
            {display} •{" "}
            <a href={href} target="_blank" className="underline">
              open in new tab
            </a>
          </figcaption>
        </figure>
      );
    }

    // Otherwise, present a download/open link
    return (
      <p className="text-sm">
        ⬇️{" "}
        <a href={href} target="_blank" className="underline break-all">
          {display}
        </a>
      </p>
    );
  }

  // request_document config is just informational here (uploads happen in course view)
  if (kind === "request_document") {
    const prompt = String(data.label ?? "Please upload the requested document in the course view.");
    return <p className="text-sm text-gray-700">{prompt}</p>;
  }

  return null;
}

async function loadBlocks(moduleId: string) {
  "use server";
  const supabase = await createSupabaseServer();
  const resp = await supabase
    .from("module_content_blocks")
    .select("id, module_id, kind, data, order_index, created_at")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  return resp.data ?? [];
}

export default async function LearnerModulePage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const sp = (await (props.searchParams ?? Promise.resolve({}))) || {};
  const preview = ((Array.isArray(sp.preview) ? sp.preview[0] : sp.preview) ?? "") === "1";

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !preview) redirect("/auth/signin");

  const { data: mod, error: mErr } = await supabase
    .from("course_modules")
    .select("id, course_id, type, title, created_at")
    .eq("id", id)
    .maybeSingle();

  if (mErr || !mod) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Module</h1>
        <p className="text-red-600">Module not found.</p>
        <Link href="/app/creator" className="underline">Back</Link>
      </div>
    );
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, status, created_by")
    .eq("id", mod.course_id)
    .maybeSingle();

  if (!course) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Module</h1>
        <p className="text-red-600">Parent course not found.</p>
        <Link href="/app/creator" className="underline">Back</Link>
      </div>
    );
  }

  // If not preview and course is not yet published, only creators/assignees may view
  if (!preview && course.status !== "published") {
    const isCreator = user?.id && course.created_by === user.id;
    let isAssigned = false;
    if (user?.id) {
      const { data: assignment } = await supabase
        .from("course_assignments")
        .select("id")
        .eq("course_id", course.id)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      isAssigned = !!assignment;
    }
    if (!isCreator && !isAssigned) {
      return (
        <div className="space-y-3 p-6">
          <h1 className="text-xl font-semibold">{mod.title ?? "Module"}</h1>
          <p className="text-gray-600">This module is not available to learners yet.</p>
          <Link href={`/app/learn/courses/${course.id}?preview=1`} className="underline text-sm">
            Open course preview
          </Link>
        </div>
      );
    }
  }

  const blocks = await loadBlocks(mod.id);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{mod.title ?? "Module"}</h1>
          <div className="text-xs text-gray-500">{mod.type}</div>
          {preview && (
            <div className="mt-2 rounded-md border border-yellow-300 bg-yellow-50 px-2 py-1 text-xs text-yellow-900">
              Preview mode — content is read-only. Use the course view to record progress or upload documents.
            </div>
          )}
        </div>
        <Link
          href={`/app/learn/courses/${course.id}?${preview ? "preview=1" : ""}`}
          className="rounded-md border px-3 py-1 text-sm"
        >
          Back to course
        </Link>
      </div>

      {/* Content */}
      <div className="rounded-xl border bg-white p-4 space-y-4">
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-600">No content yet.</p>
        ) : (
          blocks.map((b: any) => <BlockView key={b.id} block={b} />)
        )}

        {/* For quiz modules, provide a launcher into the quiz player. */}
        {mod.type === "digital_assessment_quiz" && (
          <div className="pt-2">
            <Link
              href={`/app/learn/quiz/${course.id}?module=${mod.id}${preview ? "&preview=1" : ""}`}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Start quiz
            </Link>
          </div>
        )}

        {/* For document-request style content, nudge to the course page for the upload. */}
        {blocks.some((b: any) => b.kind === "request_document") && (
          <p className="text-xs text-gray-500">
            Uploads are completed in the full course view.{" "}
            <Link
              href={`/app/learn/courses/${course.id}?${preview ? "preview=1" : ""}`}
              className="underline"
            >
              Open course
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
