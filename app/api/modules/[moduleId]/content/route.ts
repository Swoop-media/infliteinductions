import { createSupabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const supabase = await createSupabaseServer();
  const { moduleId } = await params;

  try {
    // Get module content blocks
    const { data: blocks, error: blocksError } = await supabase
      .from("module_content_blocks")
      .select("*")
      .eq("module_id", moduleId)
      .order("order_index", { ascending: true });

    if (blocksError) {
      console.error("Error fetching content blocks:", blocksError);
      return NextResponse.json(
        { error: "Failed to fetch content blocks" },
        { status: 500 }
      );
    }

    return NextResponse.json({ blocks: blocks || [] });
  } catch (error) {
    console.error("Error in content API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}