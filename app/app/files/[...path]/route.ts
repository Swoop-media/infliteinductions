// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Private file proxy for Supabase Storage "course-files".
 * Usage in UI: <img src={`/app/files/${encodeURIComponent(file_id)}`} />
 * - Auth required (redirects to /auth/login if missing)
 * - Serves files inline for viewing in course player
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

  // Check if request wants download via query parameter
  const url = new URL(request.url);
  const forceDownload = url.searchParams.get('download') === 'true';

  try {
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
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
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
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
  };

  return mimeTypes[extension] || 'application/octet-stream';
}