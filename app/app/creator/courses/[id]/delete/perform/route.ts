// @ts-nocheck
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

async function makeURL(path: string): Promise<URL> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

// Optional: if someone GETs /perform by mistake, just send them back nicely.
export async function GET() {
  const to = await makeURL("/app/creator");
  to.searchParams.set("error", "Invalid method.");
  return NextResponse.redirect(to);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();

  const can =
       (await hasRole("Admin"))
    || (await hasRole("Course Creators"))
    || (await hasRole("Creator"));

  const to = await makeURL("/app/creator");
  if (!can) {
    to.searchParams.set("error", "Not authorized.");
    return NextResponse.redirect(to);
  }

  // Explicitly clean up quiz data for this course's modules before deleting
  // the course. Legacy quiz_questions rows linked only by module_id (quiz_id
  // IS NULL) would otherwise be left behind as orphans (see migration 016),
  // and we don't rely on DB cascades for quizzes/questions/options.
  const chunk = <T,>(arr: T[], size = 150): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  {
    const { data: mods, error: modErr } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", id);
    if (modErr) {
      to.searchParams.set("error", `Module lookup failed: ${modErr.message}`);
      return NextResponse.redirect(to);
    }
    const moduleIds = (mods ?? []).map((m: any) => m.id);

    // Quizzes linked to this course directly or via its modules.
    const quizIds = new Set<string>();
    {
      const { data: byCourse, error: qcErr } = await supabase
        .from("quizzes")
        .select("id")
        .eq("course_id", id);
      if (qcErr) {
        to.searchParams.set("error", `Quiz lookup failed: ${qcErr.message}`);
        return NextResponse.redirect(to);
      }
      for (const q of byCourse ?? []) quizIds.add((q as any).id);
      for (const ids of chunk(moduleIds)) {
        const { data: byModule, error: qmErr } = await supabase
          .from("quizzes")
          .select("id")
          .in("module_id", ids);
        if (qmErr) {
          to.searchParams.set("error", `Quiz lookup failed: ${qmErr.message}`);
          return NextResponse.redirect(to);
        }
        for (const q of byModule ?? []) quizIds.add((q as any).id);
      }
    }

    // Questions linked by quiz_id OR (legacy) by module_id only.
    const questionIds = new Set<string>();
    for (const ids of chunk([...quizIds])) {
      const { data: qs, error: qErr } = await supabase
        .from("quiz_questions")
        .select("id")
        .in("quiz_id", ids);
      if (qErr) {
        to.searchParams.set("error", `Quiz question lookup failed: ${qErr.message}`);
        return NextResponse.redirect(to);
      }
      for (const q of qs ?? []) questionIds.add((q as any).id);
    }
    for (const ids of chunk(moduleIds)) {
      const { data: qs, error: qErr } = await supabase
        .from("quiz_questions")
        .select("id")
        .in("module_id", ids);
      if (qErr) {
        to.searchParams.set("error", `Quiz question lookup failed: ${qErr.message}`);
        return NextResponse.redirect(to);
      }
      for (const q of qs ?? []) questionIds.add((q as any).id);
    }

    // Delete options -> questions -> quizzes (in case FKs don't cascade).
    for (const ids of chunk([...questionIds])) {
      const { error: oErr } = await supabase
        .from("quiz_options")
        .delete()
        .in("question_id", ids);
      if (oErr) {
        to.searchParams.set("error", `Quiz option cleanup failed: ${oErr.message}`);
        return NextResponse.redirect(to);
      }
    }
    for (const ids of chunk([...questionIds])) {
      const { error: qDelErr } = await supabase
        .from("quiz_questions")
        .delete()
        .in("id", ids);
      if (qDelErr) {
        to.searchParams.set("error", `Quiz question cleanup failed: ${qDelErr.message}`);
        return NextResponse.redirect(to);
      }
    }
    for (const ids of chunk([...quizIds])) {
      const { error: quizDelErr } = await supabase
        .from("quizzes")
        .delete()
        .in("id", ids);
      if (quizDelErr) {
        to.searchParams.set("error", `Quiz cleanup failed: ${quizDelErr.message}`);
        return NextResponse.redirect(to);
      }
    }
  }

  const { error } = await supabase.from("courses").delete().eq("id", id);

  if (error) {
    const fk = (error as any).code === "23503"; // foreign_key_violation
    to.searchParams.set(
      "error",
      fk
        ? "Course has related records. Delete blocked. Consider 'archived' status instead."
        : error.message || "Delete failed."
    );
    return NextResponse.redirect(to);
  }

  to.searchParams.set("ok", "course_deleted");
  return NextResponse.redirect(to);
}