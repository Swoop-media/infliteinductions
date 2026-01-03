// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRoute } from "@/lib/supabase/server";

interface ExportUser {
  tid: string | null;
  oid: string | null;
  email: string;
  display_name: string | null;
  job_title: string | null;
  manager_email: string | null;
  department: string | null;
  is_active: boolean;
  source_updated_at: string | null;
}

interface EntraIdentity {
  tid: string | null;
  oid: string | null;
}

function extractEntraIdentity(microsoftId: string | null): EntraIdentity {
  if (!microsoftId) {
    return { tid: null, oid: null };
  }

  const guidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const guids = microsoftId.match(guidRegex) || [];

  if (guids.length >= 2) {
    return { tid: guids[0], oid: guids[1] };
  } else if (guids.length === 1) {
    return {
      tid: process.env.ENTRA_TENANT_ID ?? null,
      oid: guids[0],
    };
  }

  return { tid: null, oid: null };
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

    const users: ExportUser[] = (profiles || []).map((profile) => {
      const { tid, oid } = extractEntraIdentity(profile.microsoft_id);
      return {
        tid,
        oid,
        email: profile.email || "",
        display_name: profile.full_name,
        job_title: profile.job_description,
        manager_email: null,
        department: profile.department,
        is_active: profile.archived_at === null,
        source_updated_at: profile.updated_at || null,
      };
    });

    return NextResponse.json(users);
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error", details: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
