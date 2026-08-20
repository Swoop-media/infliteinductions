// @ts-nocheck
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getPinnedCourseContext } from "@/lib/course-version";
import { NextRequest, NextResponse } from "next/server";

/**
 * Learner-mode module content endpoint.
 *
 * By default this route serves the pinned content blocks for a trainee's
 * immutable assignment snapshot. It requires an authenticated trainee
 * assignment context and NEVER falls back to mutable live content blocks, so
 * mutating live course content cannot change what an in-flight learner sees.
 *
 * A separate, strictly-scoped contractor branch (triggered by a
 * `registrationId` query param) serves live external-contractor course content.
 * That branch only activates after verifying the contractor registration
 * belongs to a course that actually contains the requested live module, and it
 * never weakens the internal trainee authorization above.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const { moduleId } = await params;

  try {
    const searchParams = request.nextUrl.searchParams;
    const registrationId = searchParams.get("registrationId") || undefined;

    const sb = supabaseAdmin();

    // ---- Contractor branch (external contractors, live content) -----------
    // Only serve live content when the supplied contractor registration is
    // verified to belong to a published external-contractor course that
    // contains the requested live module. This is deliberately isolated from
    // the internal trainee authorization below.
    if (registrationId) {
      return await handleContractorContent(sb, moduleId, registrationId);
    }

    // ---- Internal trainee branch (pinned snapshot, no live fallback) -------
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const assignmentId = searchParams.get("assignmentId") || undefined;
    const courseId = searchParams.get("courseId") || undefined;

    let context: any = null;
    let module: any = null;

    if (assignmentId) {
      const resolved = await getPinnedCourseContext(sb, { assignmentId });
      if (resolved.assignment.user_id !== user.id) {
        return NextResponse.json(
          { error: "Not authorized for this assignment" },
          { status: 403 }
        );
      }
      context = resolved;
      module = (context.modules || []).find(
        (item: any) => item?.id === moduleId
      );
      if (!module) {
        return NextResponse.json(
          { error: "The requested module is not part of this assignment." },
          { status: 404 }
        );
      }
    } else {
      // Enumerate the authenticated trainee's assignments and pick the one
      // whose pinned snapshot contains this module.
      let query = sb
        .from("course_assignments")
        .select("id, course_id")
        .eq("user_id", user.id)
        .eq("role", "trainee");
      if (courseId) query = query.eq("course_id", courseId);

      const { data: assignments, error: assignmentsError } = await query;
      if (assignmentsError) throw assignmentsError;

      let lastError: any = null;
      for (const candidate of assignments || []) {
        try {
          const resolved = await getPinnedCourseContext(sb, {
            assignmentId: candidate.id,
          });
          const found = (resolved.modules || []).find(
            (item: any) => item?.id === moduleId
          );
          if (found) {
            context = resolved;
            module = found;
            break;
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (!context || !module) {
        return NextResponse.json(
          {
            error:
              lastError?.message ||
              "No pinned trainee assignment includes this module.",
          },
          { status: 404 }
        );
      }
    }

    const blocks = buildBlocksFromSnapshotModule(module);
    return NextResponse.json({ blocks });
  } catch (error: any) {
    console.error("Error in content API:", error);
    const message = String(error?.message || "");
    if (
      message.includes("Pinned course version is unavailable") ||
      message.includes("Trainee course assignment not found") ||
      message.includes("not part of this assignment")
    ) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Build content blocks from a pinned snapshot module, mirroring the shape the
 * client expects from module_content_blocks rows.
 */
function buildBlocksFromSnapshotModule(snapshotModule: any) {
  const contentBlocks = Array.isArray(snapshotModule?.content_blocks)
    ? [...snapshotModule.content_blocks]
    : [];
  contentBlocks.sort((a: any, b: any) => {
    const orderDiff = (a?.order_index ?? 0) - (b?.order_index ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a?.created_at ?? "").localeCompare(
      String(b?.created_at ?? "")
    );
  });
  return contentBlocks;
}

/**
 * Contractor branch: verify the registration belongs to a published
 * external-contractor course that contains the requested live module, then
 * serve live content blocks. Fails closed (404) otherwise.
 */
async function handleContractorContent(
  sb: any,
  moduleId: string,
  registrationId: string
) {
  const verifiedCourseId = await verifyContractorModule(sb, moduleId, registrationId);
  if (!verifiedCourseId) {
    return NextResponse.json(
      { error: "Not authorized for this contractor module." },
      { status: 404 }
    );
  }

  const { data: blocks, error: blocksError } = await sb
    .from("module_content_blocks")
    .select("*")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: true });

  if (blocksError) {
    console.error("Error fetching contractor content blocks:", blocksError);
    return NextResponse.json(
      { error: "Failed to fetch content blocks" },
      { status: 500 }
    );
  }

  return NextResponse.json({ blocks: blocks || [] });
}

/**
 * Returns the verified course id if the contractor registration belongs to a
 * published external-contractor course containing the given live module;
 * otherwise returns null.
 *
 * NOTE: not exported — Next.js route modules only permit HTTP-method/config
 * exports. The quiz route keeps its own copy of this verification.
 */
async function verifyContractorModule(
  sb: any,
  moduleId: string,
  registrationId: string
): Promise<string | null> {
  const { data: registration, error: regError } = await sb
    .from("contractor_course_completions")
    .select("id, course_id")
    .eq("id", registrationId)
    .maybeSingle();
  if (regError || !registration?.course_id) return null;

  const { data: module, error: moduleError } = await sb
    .from("course_modules")
    .select("id, course_id")
    .eq("id", moduleId)
    .eq("course_id", registration.course_id)
    .maybeSingle();
  if (moduleError || !module) return null;

  const { data: course, error: courseError } = await sb
    .from("courses")
    .select("id, external_contractors, status")
    .eq("id", registration.course_id)
    .eq("external_contractors", true)
    .eq("status", "published")
    .maybeSingle();
  if (courseError || !course) return null;

  return registration.course_id;
}
