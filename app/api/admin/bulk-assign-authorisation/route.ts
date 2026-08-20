// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/roles";
import { logUserAudit } from "@/lib/audit";
import { calculateAuthorizationExpiry } from "@/lib/utils/calculateAuthorizationExpiry";
import { getCurrentCourseVersion, recordAuthorisationCompletion, recordCourseCompletion } from "@/lib/training-history";
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
      .select("id, user_id, assignment_status, completed_at, approved_at, approved_by, restrictions, attempt_number")
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

    // Guard: never assign learners to unpublished (draft/archived) courses —
    // draft-course content is hidden from learners and surfaces as broken quizzes.
    // Checked in both preview and execute modes, before any writes.
    if (courseIds.length > 0) {
      const unpublished: { title: string; status: string }[] = [];
      let verifiedCount = 0;
      for (const idsChunk of chunk(courseIds, CHUNK)) {
        const { data: linkedCourses, error: statusErr } = await admin
          .from("courses")
          .select("id, title, status")
          .in("id", idsChunk);
        if (statusErr) {
          return NextResponse.json({ error: `Failed to verify course status: ${statusErr.message}` }, { status: 500 });
        }
        verifiedCount += (linkedCourses || []).length;
        for (const c of linkedCourses || []) {
          if (c.status !== "published") unpublished.push({ title: c.title, status: c.status });
        }
      }
      // Missing course rows are treated as a failure, not implicitly allowed.
      if (verifiedCount !== new Set(courseIds).size) {
        return NextResponse.json({ error: "Could not verify the status of all courses linked to this authorisation." }, { status: 500 });
      }
      if (unpublished.length > 0) {
        const names = unpublished.map((c) => `"${c.title}" (${c.status})`).join(", ");
        return NextResponse.json({
          error: `Cannot assign: this authorisation is linked to unpublished courses: ${names}. Learners cannot see draft or archived course content — publish the course(s) or unlink them from the authorisation first.`,
        }, { status: 400 });
      }
    }

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
    const latestCourseVersions = new Map(
      await Promise.all(
        courseIds.map(async (courseId) => {
          const version = await getCurrentCourseVersion(admin, courseId);
          return [courseId, version.id] as const;
        })
      )
    );

    // 1) Course completion records must exist before authorisation history is
    // captured, because the approval evidence references those immutable rows.
    if (completedUsers.length > 0 && courseIds.length > 0) {
      for (const userChunk of chunk(completedUsers, CHUNK)) {
        for (const courseChunk of chunk(courseIds, CHUNK)) {
          const { data: completedCourseRows, error: completedCourseError } = await admin
            .from("course_assignments")
            .select("id, completed_at")
            .in("user_id", userChunk)
            .in("course_id", courseChunk)
            .eq("role", "trainee")
            .eq("assignment_status", "completed")
            .not("completed_at", "is", null);
          if (completedCourseError) {
            return NextResponse.json(
              { error: `Could not load completed courses before snapshot: ${completedCourseError.message}` },
              { status: 500 }
            );
          }
          for (const row of completedCourseRows || []) {
            try {
              await recordCourseCompletion({
                assignmentId: row.id,
                completedAt: row.completed_at,
                actorId: adminUser.id,
                reason: "bulk_authorisation_retake",
                adminClient: admin,
              });
            } catch (historyError: any) {
              return NextResponse.json(
                { error: historyError?.message || "Could not preserve completed course history. Nothing was reset." },
                { status: 500 }
              );
            }
          }
        }
      }
    }

    // 2) Snapshot completed authorisation assignments before any reset.
    if (completedUsers.length > 0) {
      for (const userId of completedUsers) {
        const row = byUser.get(userId);
        try {
          await recordAuthorisationCompletion({
            assignmentId: row.id,
            completedAt: row.completed_at,
            actorId: adminUser.id,
            reason: "retake",
            adminClient: admin,
          });
        } catch (historyError: any) {
          return NextResponse.json(
            { error: historyError?.message || "Could not preserve completed authorisation history. Nothing was reset." },
            { status: 500 }
          );
        }
      }
    }

    // 3) Reset all existing authorisation assignments (completed + in-progress) back to 'assigned'
    for (const row of byUser.values()) {
      const { error } = await admin
        .from("authorisation_assignments")
        .update({
          assignment_status: "assigned",
          completed_at: null,
          attempt_number: (row.attempt_number || 1) + 1,
          created_by: adminUser.id,
        })
        .eq("id", row.id);
      if (error) errors.push(`Reset authorisation assignments: ${error.message}`);
    }

    // 4) Create authorisation assignments for users who never had one
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

    // 5) Course assignments: snapshot completed ones, wipe progress, reset/create for everyone
    if (courseIds.length > 0) {
      // Load all existing trainee course assignments for these users/courses
      const existingCourseRows: any[] = [];
      for (const userChunk of chunk(userIds, CHUNK)) {
        for (const courseChunk of chunk(courseIds, CHUNK)) {
          const { data, error } = await admin
            .from("course_assignments")
            .select("id, user_id, course_id, assignment_status, completed_at, attempt_number")
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

      // Snapshot completed course assignments. Fail before any progress is
      // deleted if one learner record cannot be preserved.
      const completedCourseRows = existingCourseRows.filter(
        (r) => r.assignment_status === "completed" && r.completed_at
      );
      for (const row of completedCourseRows) {
        try {
          await recordCourseCompletion({
            assignmentId: row.id,
            completedAt: row.completed_at,
            actorId: adminUser.id,
            reason: "bulk_authorisation_retake",
            adminClient: admin,
          });
        } catch (historyError: any) {
          return NextResponse.json(
            { error: historyError?.message || "Could not preserve completed course history. No course progress was reset." },
            { status: 500 }
          );
        }
      }

      // Delete progress for all existing assignments
      const existingCourseAssignmentIds = existingCourseRows.map((r) => r.id);
      for (const idsChunk of chunk(existingCourseAssignmentIds, CHUNK)) {
        const { error } = await admin.from("assignment_progress").delete().in("assignment_id", idsChunk);
        if (error) errors.push(`Delete progress: ${error.message}`);
        const { error: responseError } = await admin.from("requirement_responses").delete().in("assignment_id", idsChunk);
        if (responseError) errors.push(`Delete requirement responses: ${responseError.message}`);
      }

      // Reset existing course assignments and advance their attempt identity.
      for (const row of existingCourseRows) {
        const { error } = await admin
          .from("course_assignments")
          .update({
            assignment_status: "assigned",
            completed_at: null,
            course_version_id: latestCourseVersions.get(row.course_id),
            attempt_number: (row.attempt_number || 1) + 1,
            updated_at: nowIso,
            created_by: adminUser.id,
          })
          .eq("id", row.id);
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
              course_version_id: latestCourseVersions.get(courseId),
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
