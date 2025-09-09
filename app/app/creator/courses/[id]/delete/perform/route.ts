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