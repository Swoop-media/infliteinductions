// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { logUserAudit } from "@/lib/audit";
import { calculateAuthorizationExpiry } from "@/lib/utils/calculateAuthorizationExpiry";
import { notifyUser } from "@/lib/notifications/dispatcher";

const CHUNK = 150;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const isAdmin = await hasRole("Admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
    }

    const supabase = await createSupabaseServer();
    const { data: { user: adminUser } } = await supabase.auth.getUser();
    if (!adminUser) {
      return NextResponse.json({ error: "Admin authentication failed" }, { status: 401 });
    }

    const { authorisationId, mode } = await request.json();
    if (!authorisationId || !["preview", "execute"].includes(mode)) {
      return NextResponse.json({ error: "authorisationId and mode ('preview' | 'execute') are required" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Authorisation details
    const { data: auth, error: authErr } = await admin
      .from("authorisations")
      .select("id, title, valid_for_days")
      .eq("id", authorisationId)
      .maybeSingle();
    if (authErr || !auth) {
      return NextResponse.json({ error: "Authorisation not found" }, { status: 404 });
    }

    // All active (non-archived) users
    const { data: profiles, error: profErr } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .is("archived_at", null);
    if (profErr) {
      return NextResponse.json({ error: `Failed to load users: ${profErr.message}` }, { status: 500 });
    }
    const users = profiles || [];
    const userIds = users.map((u) => u.id);

    // Existing assignments for this authorisation
    const { data: existingAuthRows, error: existErr } = await admin
      .from("authorisation_assignments")
      .select("id, user_id, assignment_status, completed_at, approved_at, approved_by, restrictions")
      .eq("authorisation_id", authorisationId);
    if (existErr) {
      return NextResponse.json({ error: `Failed to load existing assignments: ${existErr.message}` }, { status: 500 });
    }
    const activeUserIdSet = new Set(userIds);
    const byUser = new Map<string, any>();
    for (const row of existingAuthRows || []) {
      if (activeUserIdSet.has(row.user_id)) byUser.set(row.user_id, row);
    }

    const completedUsers = userIds.filter((id) => byUser.get(id)?.assignment_status === "completed");
    const inProgressUsers = userIds.filter((id) => {
      const row = byUser.get(id);
      return row && row.assignment_status !== "completed";
    });
    const newUsers = userIds.filter((id) => !byUser.has(id));

    // Courses linked to this authorisation
    const { data: authCourses, error: acErr } = await admin
      .from("authorisation_courses")
      .select("course_id")
      .eq("authorisation_id", authorisationId);
    if (acErr) {
      return NextResponse.json({ error: `Failed to load authorisation courses: ${acErr.message}` }, { status: 500 });
    }
    const courseIds = (authCourses || []).map((ac) => ac.course_id);

    const summary = {
      authorisation: { id: auth.id, title: auth.title },
      totalActiveUsers: userIds.length,
      newAssignments: newUsers.length,
      completedResets: completedUsers.length,
      inProgressResets: inProgressUsers.length,
      linkedCourses: courseIds.length,
    };

    if (mode === "preview") {
      return NextResponse.json({ success: true, mode: "preview", summary });
    }

    // ---------------- EXECUTE ----------------
    const nowIso = new Date().toISOString();
    const errors: string[] = [];

    // 1) Snapshot completed authorisation assignments into history (with expiry as-of-now)
    if (completedUsers.length > 0) {
      // Gather docs + completed courses for all completed users to compute expiry
      const docsByUser = new Map<string, any[]>();
      const completedCoursesByUser = new Map<string, any[]>();

      if (courseIds.length > 0) {
        for (const userChunk of chunk(completedUsers, CHUNK)) {
          for (const courseChunk of chunk(courseIds, CHUNK)) {
            const { data: docs } = await admin
              .from("learner_documents")
              .select("user_id, expires_on, status")
              .in("user_id", userChunk)
              .in("course_id", courseChunk)
              .not("expires_on", "is", null)
              .or("status.is.null,status.neq.replaced");
            for (const d of docs || []) {
              const list = docsByUser.get(d.user_id) || [];
              list.push({ expires_on: d.expires_on });
              docsByUser.set(d.user_id, list);
            }

            const { data: completions } = await admin
              .from("course_assignments")
              .select("user_id, course_id, completed_at, courses!course_assignments_course_id_fkey(valid_for_months)")
              .in("user_id", userChunk)
              .in("course_id", courseChunk)
              .eq("role", "trainee")
              .not("completed_at", "is", null);
            for (const c of completions || []) {
              const list = completedCoursesByUser.get(c.user_id) || [];
              list.push({ valid_for_months: c.courses?.valid_for_months ?? null, completed_at: c.completed_at });
              completedCoursesByUser.set(c.user_id, list);
            }
          }
        }
      }

      const historyRows = completedUsers.map((userId) => {
        const row = byUser.get(userId);
        const approvedAt = row.approved_at
          ? new Date(row.approved_at)
          : row.completed_at
            ? new Date(row.completed_at)
            : new Date();
        let expiresAt: string | null = null;
        try {
          const expiry = calculateAuthorizationExpiry(
            approvedAt,
            auth.valid_for_days ?? null,
            docsByUser.get(userId) || [],
            completedCoursesByUser.get(userId) || []
          );
          expiresAt = expiry ? expiry.toISOString() : null;
        } catch {
          expiresAt = null;
        }
        return {
          assignment_id: row.id,
          user_id: userId,
          authorisation_id: authorisationId,
          assignment_status: row.assignment_status,
          completed_at: row.completed_at,
          approved_at: row.approved_at,
          approved_by: row.approved_by,
          restrictions: row.restrictions,
          expires_at: expiresAt,
          superseded_by: adminUser.id,
          reason: "retake",
        };
      });

      for (const rowsChunk of chunk(historyRows, CHUNK)) {
        const { error } = await admin.from("authorisation_assignment_history").insert(rowsChunk);
        if (error) {
          console.error("[bulk-assign] Could not snapshot authorisation history:", error.message);
          errors.push(`History snapshot: ${error.message}`);
        }
      }
    }

    // 2) Reset all existing authorisation assignments (completed + in-progress) back to 'assigned'
    const existingAssignmentIds = [...byUser.values()].map((r) => r.id);
    for (const idsChunk of chunk(existingAssignmentIds, CHUNK)) {
      const { error } = await admin
        .from("authorisation_assignments")
        .update({ assignment_status: "assigned", completed_at: null, created_by: adminUser.id })
        .in("id", idsChunk);
      if (error) errors.push(`Reset authorisation assignments: ${error.message}`);
    }

    // 3) Create authorisation assignments for users who never had one
    const newAuthRows = newUsers.map((userId) => ({
      user_id: userId,
      authorisation_id: authorisationId,
      role: "trainee",
      assignment_status: "assigned",
      created_by: adminUser.id,
    }));
    for (const rowsChunk of chunk(newAuthRows, CHUNK)) {
      const { error } = await admin
        .from("authorisation_assignments")
        .upsert(rowsChunk, { onConflict: "user_id,authorisation_id", ignoreDuplicates: false });
      if (error) errors.push(`Create authorisation assignments: ${error.message}`);
    }

    // 4) Course assignments: snapshot completed ones, wipe progress, reset/create for everyone
    if (courseIds.length > 0) {
      // Load all existing trainee course assignments for these users/courses
      const existingCourseRows: any[] = [];
      for (const userChunk of chunk(userIds, CHUNK)) {
        for (const courseChunk of chunk(courseIds, CHUNK)) {
          const { data, error } = await admin
            .from("course_assignments")
            .select("id, user_id, course_id, assignment_status, completed_at")
            .in("user_id", userChunk)
            .in("course_id", courseChunk)
            .eq("role", "trainee");
          if (error) {
            return NextResponse.json(
              { error: `Failed to load course assignments: ${error.message}. No changes beyond authorisation resets already applied.` },
              { status: 500 }
            );
          }
          existingCourseRows.push(...(data || []));
        }
      }

      // Snapshot completed course assignments
      const completedCourseRows = existingCourseRows.filter(
        (r) => r.assignment_status === "completed" && r.completed_at
      );
      const courseHistoryRows = completedCourseRows.map((r) => ({
        assignment_id: r.id,
        user_id: r.user_id,
        course_id: r.course_id,
        assignment_status: r.assignment_status,
        completed_at: r.completed_at,
        superseded_by: adminUser.id,
        reason: "retake",
      }));
      for (const rowsChunk of chunk(courseHistoryRows, CHUNK)) {
        const { error } = await admin.from("course_assignment_history").insert(rowsChunk);
        if (error) {
          console.error("[bulk-assign] Could not snapshot course history:", error.message);
          errors.push(`Course history snapshot: ${error.message}`);
        }
      }

      // Delete progress for all existing assignments
      const existingCourseAssignmentIds = existingCourseRows.map((r) => r.id);
      for (const idsChunk of chunk(existingCourseAssignmentIds, CHUNK)) {
        const { error } = await admin.from("assignment_progress").delete().in("assignment_id", idsChunk);
        if (error) errors.push(`Delete progress: ${error.message}`);
      }

      // Reset existing course assignments
      for (const idsChunk of chunk(existingCourseAssignmentIds, CHUNK)) {
        const { error } = await admin
          .from("course_assignments")
          .update({ assignment_status: "assigned", completed_at: null, updated_at: nowIso, created_by: adminUser.id })
          .in("id", idsChunk);
        if (error) errors.push(`Reset course assignments: ${error.message}`);
      }

      // Create missing course assignments
      const existingPairs = new Set(existingCourseRows.map((r) => `${r.user_id}:${r.course_id}`));
      const missingCourseRows: any[] = [];
      for (const userId of userIds) {
        for (const courseId of courseIds) {
          if (!existingPairs.has(`${userId}:${courseId}`)) {
            missingCourseRows.push({
              user_id: userId,
              course_id: courseId,
              role: "trainee",
              assignment_status: "assigned",
              created_by: adminUser.id,
              assigned_at: nowIso,
            });
          }
        }
      }
      for (const rowsChunk of chunk(missingCourseRows, CHUNK)) {
        const { error } = await admin
          .from("course_assignments")
          .upsert(rowsChunk, { onConflict: "user_id,course_id,role", ignoreDuplicates: false });
        if (error) errors.push(`Create course assignments: ${error.message}`);
      }

      // Note: course_enrolments is intentionally not written here. Learning flows
      // run off course_assignments; the enrolments table uses an enum status and
      // has an insert trigger that notifies admins, so mass-inserting would fail
      // or spam notifications.
    }

    // 5) Audit trail (one entry per user, best-effort, non-blocking failures)
    try {
      for (const userId of userIds) {
        await logUserAudit({
          userId,
          actorId: adminUser.id,
          action: byUser.has(userId) ? "authorisation_retake" : "authorisation_assigned",
          details: {
            authorisation_id: authorisationId,
            authorisation_title: auth.title,
            bulk: true,
          },
        });
      }
    } catch (auditErr) {
      console.error("[bulk-assign] Audit logging failed:", auditErr);
    }

    if (errors.length > 0) {
      console.error("[bulk-assign] Run completed with errors:", JSON.stringify(errors, null, 2));
      return NextResponse.json(
        {
          success: false,
          mode: "execute",
          summary,
          errors,
          error: `The run completed with ${errors.length} error(s) — some users may be in a mixed state and notifications were NOT sent. Review the errors below, then re-run this tool for the same authorisation (re-running is safe: it re-assigns and resets everyone again).`,
        },
        { status: 500 }
      );
    }

    // 6) Notifications: in-app + Teams DM for every user.
    // Run in the background so the request returns promptly; Teams DMs are slow.
    const notifyPayloadBase = {
      authorisation_id: authorisationId,
      authorizationTitle: auth.title,
      title: auth.title,
      assigned_by: adminUser.id,
      url: "/app/authorisations",
    };
    (async () => {
      let sent = 0;
      for (const batch of chunk(userIds, 5)) {
        await Promise.allSettled(
          batch.map((userId) =>
            notifyUser(userId, "authorization_assigned", { ...notifyPayloadBase })
          )
        );
        sent += batch.length;
      }
      console.log(`[bulk-assign] Notifications dispatched for ${sent} users (authorisation ${auth.title})`);
    })().catch((e) => console.error("[bulk-assign] Notification dispatch failed:", e));

    return NextResponse.json({
      success: true,
      mode: "execute",
      summary,
      errors,
      message: `Assigned "${auth.title}" to ${userIds.length} active users (${completedUsers.length} completed reset, ${inProgressUsers.length} in-progress reset, ${newUsers.length} new). Notifications are being sent in the background.`,
    });
  } catch (error) {
    console.error("[bulk-assign] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
