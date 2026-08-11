// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MEDIA_ERROR_NAMES: Record<number, string> = {
  1: "MEDIA_ERR_ABORTED",
  2: "MEDIA_ERR_NETWORK",
  3: "MEDIA_ERR_DECODE",
  4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
};

/**
 * Lightweight telemetry endpoint: the video player POSTs here when native
 * <video> playback fails, so media errors (previously swallowed) show up in
 * server logs with enough detail to diagnose format/codec problems.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === "number" ? body.code : null;
    const message = typeof body.message === "string" ? body.message.slice(0, 500) : "";
    const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.slice(0, 1000) : "";
    const userAgent = request.headers.get("user-agent") || "";

    console.error(
      "[video-playback-error]",
      JSON.stringify({
        code,
        codeName: code != null ? MEDIA_ERROR_NAMES[code] || "UNKNOWN" : "UNKNOWN",
        message,
        videoUrl,
        userId: user.id,
        userAgent,
      })
    );

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
