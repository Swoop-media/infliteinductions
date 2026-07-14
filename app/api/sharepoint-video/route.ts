import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

// Streams a SharePoint "Anyone with the link" video through the server so it
// can play in a native <video> tag without third-party cookie / iframe blocking.
// Only works for links shared as "Anyone" (no sign-in required server-side).

export const dynamic = "force-dynamic";

const ALLOWED_HOST = /(^|\.)sharepoint\.com$/i;

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // Require a signed-in user (internal SSO or external contractor account)
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) {
    return NextResponse.json(
      { error: "Only SharePoint URLs are supported" },
      { status: 400 }
    );
  }

  // Ask SharePoint for the raw file bytes instead of the web page
  target.searchParams.set("download", "1");

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    Accept: "*/*",
  };
  const range = request.headers.get("range");
  if (range) {
    upstreamHeaders["Range"] = range;
  }

  // Follow redirects manually, validating every hop stays on SharePoint
  // (prevents SSRF via open-redirect chains).
  let upstream: Response;
  let currentUrl = target;
  try {
    const MAX_REDIRECTS = 5;
    let hops = 0;
    while (true) {
      upstream = await fetch(currentUrl.toString(), {
        headers: upstreamHeaders,
        redirect: "manual",
      });
      const isRedirect = upstream.status >= 300 && upstream.status < 400;
      if (!isRedirect) break;
      const location = upstream.headers.get("location");
      if (!location || ++hops > MAX_REDIRECTS) {
        return NextResponse.json(
          { error: "Too many redirects" },
          { status: 502 }
        );
      }
      const next = new URL(location, currentUrl);
      if (next.protocol !== "https:" || !ALLOWED_HOST.test(next.hostname)) {
        return NextResponse.json(
          { error: "Redirected outside SharePoint" },
          { status: 502 }
        );
      }
      currentUrl = next;
    }
  } catch (err) {
    console.error("sharepoint-video: upstream fetch failed", err);
    return NextResponse.json(
      { error: "Could not reach SharePoint" },
      { status: 502 }
    );
  }

  const contentType = upstream.headers.get("content-type") || "";

  // If SharePoint returned a sign-in / web page instead of the file, the link
  // is not a public "Anyone" link. Tell the client so it can fall back.
  if (!upstream.ok || contentType.includes("text/html")) {
    return NextResponse.json(
      {
        error: "not_public",
        message:
          "This SharePoint link requires sign-in. Set the link to 'Anyone with the link' to play it in the page.",
      },
      { status: 409 }
    );
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    resolveContentType(contentType, currentUrl, upstream.headers.get("content-disposition"))
  );
  const passThrough = ["content-length", "content-range", "accept-ranges", "etag", "last-modified"];
  for (const h of passThrough) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(upstream.body, {
    status: upstream.status, // 200 or 206 for range requests
    headers,
  });
}

function resolveContentType(
  upstreamType: string,
  finalUrl: URL,
  contentDisposition: string | null
): string {
  // Trust an explicit video/* or audio/* type from SharePoint
  if (/^(video|audio)\//i.test(upstreamType)) return upstreamType;
  // Try the final (post-redirect) URL path, which usually has the filename
  const fromPath = guessVideoType(finalUrl.pathname);
  if (fromPath) return fromPath;
  // Try the filename in Content-Disposition
  if (contentDisposition) {
    const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    if (match) {
      const fromName = guessVideoType(decodeURIComponent(match[1]));
      if (fromName) return fromName;
    }
  }
  return "video/mp4";
}

function guessVideoType(pathname: string): string | null {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".ogv") || lower.endsWith(".ogg")) return "video/ogg";
  return null;
}
