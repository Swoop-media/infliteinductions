// @ts-nocheck
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  const canAccess =
    (await hasRole("Course Creators")) ||
    (await hasRole("Senior management")) ||
    (await hasRole("Admin"));
  
  if (!canAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = await createSupabaseServer();
  
  const { error } = await supabase
    .from("operations_notices")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/app/creator");
  return NextResponse.json({ success: true });
}
