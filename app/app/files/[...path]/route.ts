// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  videoStreamSemaphore,
  guardedStream,
  STREAM_LIFETIME_MS,
} from "@/lib/http/bounded-fetch";

export const dynamic = "force-dynamic";

/**
 * Private file proxy for Supabase Storage "course-files".
 * Usage in UI: <img src={`/app/files/${encodeURIComponent(file_id)}`} />
 * - Auth required (redirects to /auth/login if missing)
 * - Serves files inline for viewing in course player
 *
 * Access control:
 *   Admins, Senior management, and Course Creators can access any course file.
 *   All other users (learners, trainers, assessors) must have a course_assignments
 *   row for the course that owns the requested file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const supabase = await createSupabaseServer();

  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const resolvedParams = await params;
  const fileId = decodeURIComponent((resolvedParams.path || []).join("/"));
  if (!fileId) return new NextResponse("Missing file path", { status: 400 });

  // --- Entitlement check ---
  const adminClient = supabaseAdmin();

  // Check if the user holds a privileged role that grants access to all course files
  const privilegedRoleNames = ["Admin", "Senior management", "Course Creators"];
  let isPrivileged = false;
  for (const roleName of privilegedRoleNames) {
    const { data: roleResult } = await supabase.rpc("has_role", {
      uid: user.id,
      role_name: roleName,
    });
    if (roleResult) {
      isPrivileged = true;
      break;
    }
  }

  if (!isPrivileged) {
    // Resolve which course owns this file via module_content_blocks.
    // File blocks store storage_path in data; video blocks store the proxy URL in data.url.
    const videoProxyUrl = `/app/files/${fileId}`;

    // Collect all modules that reference this file. IMPORTANT: always filter
    // by `kind` — an unfiltered JSON expression scan over module_content_blocks
    // hits the DB statement timeout, and a timed-out lookup must not be
    // mistaken for "file not registered".
    const moduleIds = new Set<string>();

    // File blocks: data->>'storage_path' = fileId, or legacy data->>'file_id' = fileId
    const [fileByPath, fileByLegacyId, videoBlocks] = await Promise.all([
      adminClient
        .from("module_content_blocks")
        .select("module_id")
        .eq("kind", "file")
        .filter("data->>storage_path", "eq", fileId)
        .limit(200),
      adminClient
        .from("module_content_blocks")
        .select("module_id")
        .eq("kind", "file")
        .filter("data->>file_id", "eq", fileId)
        .limit(200),
      adminClient
        .from("module_content_blocks")
        .select("module_id")
        .eq("kind", "video_embed")
        .filter("data->>url", "eq", videoProxyUrl)
        .limit(200),
    ]);

    if (fileByPath.error || fileByLegacyId.error || videoBlocks.error) {
      console.error(
        "File entitlement lookup error:",
        fileByPath.error?.message || fileByLegacyId.error?.message || videoBlocks.error?.message,
        fileId
      );
      return new NextResponse("Internal server error", { status: 500 });
    }

    for (const row of [...(fileByPath.data || []), ...(fileByLegacyId.data || []), ...(videoBlocks.data || [])]) {
      if (row.module_id) moduleIds.add(row.module_id);
    }

    let courseIds: string[] = [];
    if (moduleIds.size > 0) {
      const { data: mods, error: modsError } = await adminClient
        .from("course_modules")
        .select("course_id")
        .in("id", Array.from(moduleIds));
      if (modsError) {
        console.error("File entitlement module lookup error:", modsError.message, fileId);
        return new NextResponse("Internal server error", { status: 500 });
      }
      courseIds = Array.from(new Set((mods || []).map(m => m.course_id).filter(Boolean)));
    }

    if (courseIds.length === 0) {
      // File is not registered in any course block — deny access
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Check the user has an assignment (any role) for any owning course.
    // Note: duplicate assignment rows exist for some users, so never use
    // maybeSingle() here — it errors on >1 row and would deny access.
    const { data: assignments, error: assignmentError } = await adminClient
      .from("course_assignments")
      .select("id")
      .in("course_id", courseIds)
      .eq("user_id", user.id)
      .limit(1);

    if (assignmentError) {
      console.error("File entitlement assignment lookup error:", assignmentError.message, fileId);
      return new NextResponse("Internal server error", { status: 500 });
    }

    if (!assignments || assignments.length === 0) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }
  // --- End entitlement check ---

  // Check if request wants download via query parameter
  const url = new URL(request.url);
  const forceDownload = url.searchParams.get('download') === 'true';

  try {
    // Videos: stream through the server with HTTP Range passthrough so the
    // <video> tag gets 206 partial responses and a correct Content-Type from
    // our own origin. (The previous 302-redirect to a Supabase signed URL
    // broke playback on mobile browsers, e.g. Edge on iOS.)
    const ext = fileId.split('.').pop()?.toLowerCase() || '';
    // mp4/m4v/webm match the upload policy; mov/ogv/ogg remain for legacy
    // content uploaded before format enforcement. mkv was never playable.
    const videoExts = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg'];
    if (videoExts.includes(ext) && !forceDownload) {
      const { data: signed, error: signedError } = await supabase
        .storage
        .from("course-files")
        .createSignedUrl(fileId, 3600); // 1 hour

      if (!signedError && signed?.signedUrl) {
        // Bound concurrent proxied streams: unbounded streams can exhaust
        // sockets/memory on the 1 vCPU VM (Aug 2026 wedges).
        if (!videoStreamSemaphore.tryAcquire()) {
          return new NextResponse("Too many concurrent video streams, try again shortly", {
            status: 503,
            headers: { 'Retry-After': '5' },
          });
        }
        let slotReleased = false;
        const releaseSlot = () => {
          if (!slotReleased) { slotReleased = true; videoStreamSemaphore.release(); }
        };
        try {
          const upstreamHeaders: Record<string, string> = {};
          const rangeHeader = request.headers.get('range');
          if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

          // Cancel the upstream fetch when the client disconnects, and cap
          // total stream lifetime so a stalled upstream can't hold the socket.
          const streamSignal = AbortSignal.any([
            request.signal,
            AbortSignal.timeout(STREAM_LIFETIME_MS),
          ]);
          const upstream = await fetch(signed.signedUrl, {
            headers: upstreamHeaders,
            signal: streamSignal,
          });

          if (upstream.ok && upstream.body) {
            const headers = new Headers();
            headers.set('Content-Type', getMimeType(ext));
            for (const h of ['content-length', 'content-range', 'etag', 'last-modified']) {
              const v = upstream.headers.get(h);
              if (v) headers.set(h, v);
            }
            headers.set('Accept-Ranges', 'bytes');
            headers.set('Content-Disposition', 'inline');
            headers.set('Cache-Control', 'private, no-store');
            const body = guardedStream(upstream.body, {
              signal: streamSignal,
              onDone: releaseSlot,
            });
            return new NextResponse(body, {
              status: upstream.status, // 200, or 206 for range requests
              headers,
            });
          }
          console.error('Video stream upstream error:', upstream.status, fileId);
          upstream.body?.cancel().catch(() => {});
          releaseSlot();
        } catch (streamErr) {
          releaseSlot();
          if (request.signal.aborted) {
            return new NextResponse(null, { status: 499 });
          }
          console.error('Video stream fetch error:', streamErr, fileId);
        }
        // Do NOT fall through to the buffered storage download for videos:
        // .download() materializes the whole file in memory with no range
        // support, which is exactly the unbounded operation that wedges the
        // VM when the upstream is already failing. Let the player retry.
        return new NextResponse("Video temporarily unavailable, please retry", {
          status: 502,
          headers: { 'Retry-After': '5' },
        });
      }
      // fall through to direct download if signing/streaming fails
    }

    // Download the file content directly
    const { data: fileData, error } = await supabase
      .storage
      .from("course-files")
      .download(fileId);

    if (error || !fileData) {
      return new NextResponse("File not found", { status: 404 });
    }

    // Get file extension to determine MIME type
    const extension = fileId.split('.').pop()?.toLowerCase() || '';
    const mimeType = getMimeType(extension);
    
    // Create response with appropriate headers for inline viewing
    const response = new NextResponse(fileData, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': forceDownload ? 'attachment' : 'inline',
        'Cache-Control': 'private, no-store',
      },
    });

    return response;
  } catch (err) {
    console.error('File proxy error:', err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

// Helper function to get MIME type based on file extension
function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    // Text
    'txt': 'text/plain',
    'md': 'text/markdown',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    
    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    
    // Video
    'mp4': 'video/mp4',
    'm4v': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'webm': 'video/webm',
    'ogv': 'video/ogg',
    'mkv': 'video/x-matroska',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
  };

  return mimeTypes[extension] || 'application/octet-stream';
}
