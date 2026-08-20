// app/app/release-notes/unread/route.ts
// GET – returns { count: number } of published release notes unread by this user.
//
// Uses the atomic RPC get_unread_release_note_count() (migration 034).
// Fails closed on auth (401). Returns { count: 0 } when the function is not
// yet available so the badge hides gracefully rather than breaking the app.
//
// There is no POST handler here. Mark-as-read is performed server-side by the
// release notes page itself (which knows the exact id+published_at versions it
// rendered). The bell component optimistically clears its local count on
// navigation; polling restores the true count after the page completes the write.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRoute } from "@/lib/supabase/server";
import { countUnreadReleases } from "@/lib/release-notes/server-helpers";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createSupabaseRoute();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { count } = await countUnreadReleases(supabase, user.id);
    return NextResponse.json({ count });
  } catch (e: unknown) {
    console.error("[release-notes/unread GET]", e);
    return NextResponse.json({ count: 0 });
  }
}
