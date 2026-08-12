// @ts-nocheck
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseService } from "@/lib/supabase/service";
import { hasRole } from "@/lib/roles";

async function makeURL(path: string): Promise<URL> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(req: Request) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) return NextResponse.redirect(await makeURL("/app/home"));

  const supabaseAuth = await createSupabaseServer();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.redirect(await makeURL("/app/home"));

  const form = await req.formData();
  const jobId = String(form.get("job_id") || "").trim();

  const back = await makeURL("/app/admin/tools/video-compression");

  if (!jobId) {
    back.searchParams.set("error", "Missing job id");
    return NextResponse.redirect(back);
  }

  const supabase = createSupabaseService();

  // Only failed jobs may be re-queued; verify current state server-side.
  const { data: job, error: fetchError } = await supabase
    .from("video_compression_jobs")
    .select("id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (fetchError || !job) {
    back.searchParams.set("error", "Job not found");
    return NextResponse.redirect(back);
  }
  if (job.status !== "failed") {
    back.searchParams.set("error", `Job is ${job.status}, not failed — nothing to re-queue`);
    return NextResponse.redirect(back);
  }

  const { error: updateError } = await supabase
    .from("video_compression_jobs")
    .update({
      status: "queued",
      attempts: 0,
      error: null,
      started_at: null,
      finished_at: null,
    })
    .eq("id", jobId)
    .eq("status", "failed");

  if (updateError) {
    back.searchParams.set("error", `Failed to re-queue: ${updateError.message}`);
    return NextResponse.redirect(back);
  }

  back.searchParams.set("ok", "requeued");
  return NextResponse.redirect(back);
}
