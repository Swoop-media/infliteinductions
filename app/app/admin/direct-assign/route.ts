// @ts-nocheck

// @ts-nocheck
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    
    const {
      data: { user },
    } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user_id, course_id, role } = await req.json();

    // Create direct assignment record
    const { data: assignment, error: assignError } = await supabase
      .from("course_assignments")
      .upsert({
        user_id,
        course_id,
        created_by: user.id,
        role,
        status: 'active',
        assigned_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,course_id,role',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (assignError) {
      console.error("Assignment error:", assignError);
      return NextResponse.json({ error: assignError.message }, { status: 500 });
    }

    console.log("Direct assignment created:", assignment);
    
    return NextResponse.json({ 
      success: true, 
      assignment,
      message: "Course assigned successfully" 
    });

  } catch (error) {
    console.error("Direct assign error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
