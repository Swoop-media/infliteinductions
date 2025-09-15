import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const moduleId = searchParams.get("moduleId") || "fccf166c-5594-4ab7-9530-6b959eb42a93";
  
  try {
    const supabase = await createSupabaseServer();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // Try to fetch blocks
    const { data: blocks, error: blocksError } = await supabase
      .from("module_content_blocks")
      .select("*")
      .eq("module_id", moduleId)
      .order("order_index", { ascending: true });
    
    // Get user profile with roles
    let userProfile = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      userProfile = profile;
    }
    
    // Try to fetch module info
    const { data: moduleData, error: moduleError } = await supabase
      .from("course_modules")
      .select("*")
      .eq("id", moduleId)
      .single();
    
    // Check if we can access courses table
    let courseData = null;
    let courseError = null;
    if (moduleData) {
      const courseResult = await supabase
        .from("courses")
        .select("id, title")
        .eq("id", (moduleData as any).course_id || "")
        .single();
      courseData = courseResult.data;
      courseError = courseResult.error;
    }
    
    return NextResponse.json({
      debug: {
        moduleId,
        timestamp: new Date().toISOString(),
        user: {
          authenticated: !!user,
          id: user?.id || null,
          email: user?.email || null,
          roles: (userProfile as any)?.roles || null,
          error: userError?.message || null
        },
        module_content_blocks: {
          success: !blocksError,
          error: blocksError?.message || null,
          count: blocks?.length || 0,
          data: blocks || []
        },
        course_modules: {
          success: !moduleError,
          error: moduleError?.message || null,
          data: moduleData || null
        },
        courses: {
          success: !courseError,
          error: courseError?.message || null,
          data: courseData || null
        }
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}