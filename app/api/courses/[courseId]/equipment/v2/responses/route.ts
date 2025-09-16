// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const resolvedParams = await params;
    const courseId = resolvedParams.courseId;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const instanceId = searchParams.get("instance_id");
    
    if (!courseId || !userId) {
      return NextResponse.json({ 
        error: "Course ID and user ID are required" 
      }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    // Build query
    let query = supabase
      .from("form_responses")
      .select(`
        *,
        form_items!inner (
          id,
          stable_id,
          equipment_name,
          description,
          required,
          instance_id
        ),
        form_instances!inner (
          id,
          course_id,
          title,
          kind
        )
      `)
      .eq("user_id", userId)
      .eq("is_latest", true)
      .eq("form_instances.course_id", courseId);
    
    // Filter by instance if provided
    if (instanceId) {
      query = query.eq("instance_id", instanceId);
    }
    
    const { data: responses, error } = await query;
    
    if (error) {
      console.error("Error fetching responses:", error);
      return NextResponse.json({ error: "Failed to fetch responses" }, { status: 500 });
    }
    
    // Get progress for each instance
    const { data: progress } = await supabase
      .from("form_progress_cache")
      .select("*")
      .eq("user_id", userId);
    
    // Format response
    const responseMap: Record<string, any> = {};
    responses?.forEach(resp => {
      const key = `${resp.instance_id}_${resp.form_items.stable_id}`;
      responseMap[key] = {
        id: resp.id,
        instance_id: resp.instance_id,
        item_id: resp.item_id,
        response_text: resp.response_text,
        revision_number: resp.revision_number,
        submitted_at: resp.submitted_at,
        equipment_name: resp.form_items.equipment_name,
        required: resp.form_items.required
      };
    });
    
    return NextResponse.json({
      responses: responseMap,
      progress: progress || [],
      total_responses: responses?.length || 0
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const resolvedParams = await params;
    const courseId = resolvedParams.courseId;
    const body = await request.json();
    
    const { instance_id, item_id, response_text, user_id } = body;
    
    if (!instance_id || !item_id || !user_id) {
      return NextResponse.json({ 
        error: "Missing required fields" 
      }, { status: 400 });
    }
    
    const supabase = await createSupabaseServer();
    
    // Verify the item belongs to the course
    const { data: item, error: itemError } = await supabase
      .from("form_items")
      .select(`
        *,
        form_instances!inner (
          course_id
        )
      `)
      .eq("id", item_id)
      .eq("form_instances.course_id", courseId)
      .single();
    
    if (itemError || !item) {
      return NextResponse.json({ 
        error: "Item not found or doesn't belong to this course" 
      }, { status: 400 });
    }
    
    // Insert response (trigger handles revision)
    const { data: response, error: responseError } = await supabase
      .from("form_responses")
      .insert({
        instance_id,
        item_id,
        user_id,
        response_text,
        is_latest: true
      })
      .select()
      .single();
    
    if (responseError) {
      console.error("Error saving response:", responseError);
      return NextResponse.json({ 
        error: "Failed to save response" 
      }, { status: 500 });
    }
    
    // Update progress cache
    const { data: progress } = await supabase
      .from("form_progress_cache")
      .select("*")
      .eq("instance_id", instance_id)
      .eq("user_id", user_id)
      .single();
    
    return NextResponse.json({
      success: true,
      response,
      progress,
      message: `Response saved (revision ${response.revision_number})`
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}