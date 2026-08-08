// @ts-nocheck
// app/api/document-cleanup/route.ts
//
// Best-effort cleanup for the learner course-page upload flow
// (DocumentUploadBlock). The client uploads the file to the
// learner-documents bucket first, then calls /api/document-replaced to
// create the record. If that record save fails, the client calls this
// route so the just-uploaded file doesn't stay stranded in storage.
//
// Safety guarantees:
//   - Only the authenticated user's own folder can be targeted.
//   - The file is deleted ONLY if no learner_documents row references it
//     (active OR replaced) — documents with a database record are never
//     touched, so this can't be used to delete a saved document's file.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 15;

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
    const filePath = String(body.filePath || "");

    // Only allow paths inside the caller's own storage folder.
    if (!filePath || !filePath.startsWith(`${user.id}/`) || filePath.includes("..")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Refuse to delete any file that a learner_documents row references,
    // regardless of status (active, replaced, archived, ...). Fail closed:
    // if the check itself errors, do NOT delete.
    const { data: refRows, error: refError } = await admin
      .from("learner_documents")
      .select("id")
      .eq("file_path", filePath)
      .limit(1);
    if (refError) {
      console.error("[document-cleanup] reference check failed, refusing to delete:", refError);
      return NextResponse.json({ error: "Could not verify file is unreferenced" }, { status: 500 });
    }
    if (refRows && refRows.length > 0) {
      return NextResponse.json(
        { error: "File is referenced by a document record and cannot be cleaned up" },
        { status: 409 }
      );
    }

    const { error: removeError } = await admin.storage
      .from("learner-documents")
      .remove([filePath]);
    if (removeError) {
      console.error("[document-cleanup] storage remove failed:", removeError);
      return NextResponse.json({ error: "Failed to remove file" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[document-cleanup] API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
