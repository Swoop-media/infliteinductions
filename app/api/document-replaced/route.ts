// @ts-nocheck
// app/api/document-replaced/route.ts
//
// Single server endpoint for the learner course-page document upload flow
// (DocumentUploadBlock). The client only uploads the file to storage, then
// calls this route, which performs the whole replacement server-side:
//
//   1. Validates ownership and linkage (trainee course assignment, module
//      belongs to course, block belongs to module).
//   2. Marks any existing active learner_documents rows for the
//      user/module/block as status='replaced' (retention-first).
//   3. Inserts the new document row as the active one.
//   4. Applies the durable re-review state transitions (onsite assessment
//      reset, course assignment demotion, authorisation revert to
//      pending_approval).
//
// Steps 2-4 run inside ONE database transaction via the
// replace_learner_document RPC (migration 023), so a failure rolls back the
// whole replacement — the required re-review can never be silently skipped
// while the replacement sticks. Audit + reviewer notifications run after
// commit (best-effort; the durable re-review state is already committed).
//
// Until migration 023 is applied to the live Supabase DB, the route falls
// back to a sequential path with the same validation, compensation on insert
// failure, and hard failure (HTTP 500) if the re-review side-effects report
// any error — success is never returned while re-review may have been
// skipped.
//
// All writes are applied to the *authenticated* user only, so a caller
// cannot replace documents or trigger side-effects for someone else.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  handleDocumentReplacement,
  auditAndNotifyDocumentReplacement,
} from "@/lib/documents/replacement-side-effects";

export const runtime = "nodejs";
export const maxDuration = 30;

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
    const moduleId = String(body.moduleId || "");
    const blockId = String(body.blockId || "");
    const title = String(body.title || "");
    const filePath = String(body.filePath || "");
    const fileSize = Number.isFinite(Number(body.fileSize)) ? Number(body.fileSize) : null;
    const fileType = body.fileType ? String(body.fileType) : null;
    const expiresOn = body.expiresOn ? String(body.expiresOn) : null;
    const assignmentId = body.assignmentId ? String(body.assignmentId) : null;

    if (!courseId || !moduleId || !blockId || !title || !filePath) {
      return NextResponse.json(
        { error: "Missing required fields (courseId, moduleId, blockId, title, filePath)" },
        { status: 400 }
      );
    }

    // The storage upload is done by the client into the authenticated user's
    // own folder; reject paths outside it so a caller can't attach someone
    // else's file to their record.
    if (!filePath.startsWith(`${user.id}/`) || filePath.includes("..")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // ---- Preferred path: one atomic DB transaction (migration 023) ------
    const { data: rpcData, error: rpcError } = await admin.rpc("replace_learner_document", {
      p_user_id: user.id,
      p_course_id: courseId,
      p_module_id: moduleId,
      p_block_id: blockId,
      p_title: title,
      p_file_path: filePath,
      p_file_size: fileSize,
      p_file_type: fileType,
      p_expires_on: expiresOn,
      p_assignment_id: assignmentId,
    });

    if (!rpcError) {
      const reverted = rpcData?.revertedAuthorisations || [];
      // Post-commit follow-ups (audit + reviewer notifications). The durable
      // re-review state is already committed; failures here are logged and
      // surfaced but do not undo the replacement.
      const { errors: notifyErrors } = await auditAndNotifyDocumentReplacement({
        userId: user.id,
        courseId,
        courseTitle: rpcData?.courseTitle || null,
        documentTitle: title,
        documentId: rpcData?.documentId || null,
        actorId: user.id,
        revertedAuthorisations: reverted,
      });
      if (notifyErrors.length > 0) {
        console.error("[document-replaced] post-commit follow-up errors:", notifyErrors);
      }
      return NextResponse.json({
        success: true,
        documentId: rpcData?.documentId || null,
        replacedCount: rpcData?.replacedCount || 0,
        sideEffects: {
          onsiteAssessmentReset: !!rpcData?.onsiteAssessmentReset,
          courseAssignmentReverted: !!rpcData?.courseAssignmentReverted,
          revertedAuthorisations: reverted,
          errors: notifyErrors,
        },
      });
    }

    // Validation failures raised by the RPC → 4xx, not fallback.
    const rpcMsg = rpcError.message || "";
    const validationErrors = {
      invalid_course: "Course not found",
      module_not_in_course: "Module does not belong to this course",
      block_not_in_module: "Upload block does not belong to this module",
      no_trainee_assignment: "You are not assigned to this course",
      assignment_mismatch: "Assignment does not match this course",
    };
    for (const [code, msg] of Object.entries(validationErrors)) {
      if (rpcMsg.includes(code)) {
        return NextResponse.json({ error: msg }, { status: code === "no_trainee_assignment" ? 403 : 400 });
      }
    }

    // Only fall back when the function simply isn't installed yet
    // (migration 023 not applied). Any other RPC error is a real failure.
    const fnMissing = rpcError.code === "PGRST202" || rpcMsg.includes("Could not find the function");
    if (!fnMissing) {
      console.error("[document-replaced] RPC error:", rpcError);
      return NextResponse.json({ error: "Failed to save document" }, { status: 500 });
    }
    console.warn(
      "[document-replaced] replace_learner_document RPC missing — apply app/migrations/023_replace_learner_document_rpc.sql. Using sequential fallback."
    );
    return await sequentialFallback(admin, {
      userId: user.id,
      courseId,
      moduleId,
      blockId,
      title,
      filePath,
      fileSize,
      fileType,
      expiresOn,
      assignmentId,
    });
  } catch (e) {
    console.error("[document-replaced] API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Sequential path used only until migration 023 is applied. Same validation
 * as the RPC, compensation (re-activate replaced rows) if the insert fails,
 * and a hard 500 if the re-review side-effects report any error — the client
 * never sees success while the required re-review may have been skipped.
 */
async function sequentialFallback(admin, p) {
  const { userId, courseId, moduleId, blockId, title, filePath, fileSize, fileType, expiresOn, assignmentId } = p;

  // ---- Validation (mirrors the RPC) ----
  const [{ data: moduleRow }, { data: blockRow }, { data: traineeRow }, { data: courseRow }] = await Promise.all([
    admin.from("course_modules").select("id, title").eq("id", moduleId).eq("course_id", courseId).maybeSingle(),
    admin.from("module_content_blocks").select("id").eq("id", blockId).eq("module_id", moduleId).maybeSingle(),
    admin
      .from("course_assignments")
      .select("id")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .limit(1)
      .maybeSingle(),
    admin.from("courses").select("title").eq("id", courseId).maybeSingle(),
  ]);
  if (!courseRow) return NextResponse.json({ error: "Course not found" }, { status: 400 });
  if (!moduleRow) return NextResponse.json({ error: "Module does not belong to this course" }, { status: 400 });
  if (!blockRow) return NextResponse.json({ error: "Upload block does not belong to this module" }, { status: 400 });
  if (!traineeRow) return NextResponse.json({ error: "You are not assigned to this course" }, { status: 403 });
  if (assignmentId) {
    const { data: assignmentRow } = await admin
      .from("course_assignments")
      .select("id")
      .eq("id", assignmentId)
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .maybeSingle();
    if (!assignmentRow) {
      return NextResponse.json({ error: "Assignment does not match this course" }, { status: 400 });
    }
  }

  // ---- Mark previous active rows as replaced ----
  const nowIso = new Date().toISOString();
  const { data: replacedRows, error: replaceError } = await admin
    .from("learner_documents")
    .update({ status: "replaced", updated_at: nowIso })
    .eq("user_id", userId)
    .eq("module_id", moduleId)
    .eq("block_id", blockId)
    .neq("status", "replaced")
    .select("id");
  if (replaceError) {
    console.error("[document-replaced] fallback: error marking previous document as replaced:", replaceError);
    return NextResponse.json({ error: "Failed to replace previous document" }, { status: 500 });
  }
  const replacedIds = (replacedRows || []).map((r) => r.id);
  const replacedCount = replacedIds.length;

  // ---- Insert new active row (compensate on failure) ----
  const { data: inserted, error: dbError } = await admin
    .from("learner_documents")
    .insert({
      user_id: userId,
      course_id: courseId,
      module_id: moduleId,
      block_id: blockId,
      title,
      file_path: filePath,
      file_size: fileSize,
      file_type: fileType,
      expires_on: expiresOn,
      assignment_id: assignmentId,
      course_title: courseRow?.title || "",
      module_title: moduleRow?.title || "",
      status: "active",
      created_at: nowIso,
    })
    .select()
    .single();
  if (dbError) {
    console.error("[document-replaced] fallback: insert failed, compensating:", dbError);
    if (replacedIds.length > 0) {
      const { error: compError } = await admin
        .from("learner_documents")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .in("id", replacedIds);
      if (compError) {
        console.error("[document-replaced] fallback: COMPENSATION FAILED — previous rows left replaced:", compError);
      }
    }
    return NextResponse.json({ error: "Failed to save document record" }, { status: 500 });
  }

  // ---- Re-review side-effects: any error is a request failure ----
  let sideEffects = null;
  if (replacedCount > 0) {
    sideEffects = await handleDocumentReplacement({
      userId,
      courseId,
      documentTitle: title,
      documentId: inserted?.id || null,
      actorId: userId,
    });
    if (sideEffects.errors.length > 0) {
      console.error("[document-replaced] fallback: side-effects reported errors:", sideEffects.errors);
      return NextResponse.json(
        {
          error:
            "Your document was uploaded, but the required re-review could not be triggered. Please try uploading again or contact support.",
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    documentId: inserted?.id || null,
    replacedCount,
    sideEffects,
  });
}
