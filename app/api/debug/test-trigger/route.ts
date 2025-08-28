
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  const { userId, courseId } = await request.json();
  
  if (!userId || !courseId) {
    return NextResponse.json({ error: "Missing userId or courseId" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  try {
    // Get assignment
    const { data: assignment } = await supabase
      .from("course_assignments")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("role", "trainee")
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "No assignment found" }, { status: 404 });
    }

    // Manually call the notification function
    const { data, error } = await supabase.rpc('notify_onsite_training_ready_manual', {
      p_assignment_id: assignment.id,
      p_user_id: userId,
      p_course_id: courseId
    });

    if (error) {
      return NextResponse.json({ 
        error: "Manual trigger failed", 
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Manual trigger executed",
      data 
    });

  } catch (error) {
    return NextResponse.json({ 
      error: "Manual trigger failed", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
