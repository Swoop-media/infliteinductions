// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

    // Try file block first (data->>'storage_path' = fileId)
    let courseId: string | null = null;

    const { data: fileBlock } = await adminClient
      .from("module_content_blocks")
      .select("module_id")
      .filter("data->>storage_path", "eq", fileId)
      .maybeSingle();

    if (fileBlock?.module_id) {
      const { data: mod } = await adminClient
        .from("course_modules")
        .select("course_id")
        .eq("id", fileBlock.module_id)
        .maybeSingle();
      courseId = mod?.course_id ?? null;
    }

    if (!courseId) {
      // Try video block (data->>'url' = '/app/files/<fileId>')
      const { data: videoBlock } = await adminClient
        .from("module_content_blocks")
        .select("module_id")
        .filter("data->>url", "eq", videoProxyUrl)
        .maybeSingle();

      if (videoBlock?.module_id) {
        const { data: mod } = await adminClient
          .from("course_modules")
          .select("course_id")
          .eq("id", videoBlock.module_id)
          .maybeSingle();
        courseId = mod?.course_id ?? null;
      }
    }

    if (!courseId) {
      // File is not registered in any course block — deny access
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Check the user has an assignment (any role) for the owning course
    const { data: assignment } = await adminClient
      .from("course_assignments")
      .select("id")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!assignment) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }
  // --- End entitlement check ---

  // Check if request wants download via query parameter
  const url = new URL(request.url);
  const forceDownload = url.searchParams.get('download') === 'true';

  try {
    // Videos: redirect to a short-lived signed URL so the browser streams
    // straight from Supabase storage (supports Range requests / seeking,
    // and avoids loading huge files into server memory)
    const ext = fileId.split('.').pop()?.toLowerCase() || '';
    const videoExts = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg', 'mkv'];
    if (videoExts.includes(ext) && !forceDownload) {
      const { data: signed, error: signedError } = await supabase
        .storage
        .from("course-files")
        .createSignedUrl(fileId, 3600); // 1 hour

      if (!signedError && signed?.signedUrl) {
        return NextResponse.redirect(signed.signedUrl, {
          status: 302,
          headers: { 'Cache-Control': 'private, no-store' },
        });
      }
      // fall through to direct download if signing fails
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
