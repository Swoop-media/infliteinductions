// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRoute } from "@/lib/supabase/server";

interface ExportUser {
  tid: string;
  oid: string;
  email: string;
  display_name: string | null;
  job_title: string | null;
  manager_email: string | null;
  department: string | null;
  is_active: boolean;
  source_updated_at: string | null;
}

export async function GET(request: NextRequest) {
  const syncToken = request.headers.get("x-training-sync-token");
  const expectedSecret = process.env.TRAINING_SYNC_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Server misconfiguration: TRAINING_SYNC_SECRET not set" },
      { status: 500 }
    );
  }

  if (!syncToken || syncToken !== expectedSecret) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing x-training-sync-token header" },
      { status: 401 }
    );
  }

  try {
    const supabase = await createSupabaseRoute(true);

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, microsoft_id, email, full_name, job_description, department, archived_at, updated_at")
      .order("full_name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch users", details: error.message },
        { status: 500 }
      );
    }

    const users: ExportUser[] = (profiles || []).map((profile) => ({
      tid: profile.id,
      oid: profile.microsoft_id || "",
      email: profile.email || "",
      display_name: profile.full_name,
      job_title: profile.job_description,
      manager_email: null,
      department: profile.department,
      is_active: profile.archived_at === null,
      source_updated_at: profile.updated_at || null,
    }));

    return NextResponse.json(users);
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error", details: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
