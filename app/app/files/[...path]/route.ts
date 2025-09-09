// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Private file proxy for Supabase Storage "course-files".
 * Usage in UI: <img src={`/app/files/${encodeURIComponent(file_id)}`} />
 * - Auth required (redirects to /auth/login if missing)
 * - Issues a short redirect to a fresh signed URL (1 hour)
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

  const { data, error } = await supabase
    .storage
    .from("course-files")
    .createSignedUrl(fileId, 60 * 60); // 1h

  if (error || !data?.signedUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, 302);
}