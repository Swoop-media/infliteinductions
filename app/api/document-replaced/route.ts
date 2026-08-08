// @ts-nocheck
// app/api/document-replaced/route.ts
//
// Called by the learner course-page upload flow (DocumentUploadBlock) after
// it has marked a previous document as replaced and inserted the new active
// row. Runs the shared server-side replacement side-effects: reset onsite
// assessment completion and revert linked authorisations to pending approval.
//
// The side-effects are always applied to the *authenticated* user, so a
// caller cannot trigger effects for someone else.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { handleDocumentReplacement } from "@/lib/documents/replacement-side-effects";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const courseId = String(body.courseId || "");
    const documentTitle = body.documentTitle ? String(body.documentTitle) : null;
    const documentId = body.documentId ? String(body.documentId) : null;

    if (!courseId) {
      return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
    }

    const result = await handleDocumentReplacement({
      userId: user.id,
      courseId,
      documentTitle,
      documentId,
      actorId: user.id,
    });

    return NextResponse.json({ success: true, result });
  } catch (e) {
    console.error("[document-replaced] API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
