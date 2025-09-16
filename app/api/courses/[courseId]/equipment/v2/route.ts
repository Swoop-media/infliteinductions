import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const resolvedParams = await params;
    const courseId = resolvedParams.courseId;
    
    if (!courseId) {
      return NextResponse.json({ error: "Course ID is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServer();
    
    // Get all form instances for this course
    const { data: instances, error: instancesError } = await supabase
      .from("form_instances")
      .select("*")
      .eq("course_id", courseId)
      .eq("kind", "equipment")
      .eq("active", true)
      .order("created_at", { ascending: true });
    
    if (instancesError) {
      console.error("Error fetching form instances:", instancesError);
      return NextResponse.json({ error: "Failed to fetch equipment forms" }, { status: 500 });
    }
    
    if (!instances || instances.length === 0) {
      return NextResponse.json({ 
        instances: [], 
        message: "No equipment forms found for this course" 
      });
    }
    
    // Get all items for these instances
    const instanceIds = instances.map(i => i.id);
    const { data: items, error: itemsError } = await supabase
      .from("form_items")
      .select("*")
      .in("instance_id", instanceIds)
      .order("order_index", { ascending: true });
    
    if (itemsError) {
      console.error("Error fetching form items:", itemsError);
      return NextResponse.json({ error: "Failed to fetch equipment items" }, { status: 500 });
    }
    
    // Group items by instance
    const instancesWithItems = instances.map(instance => ({
      ...instance,
      items: items?.filter(item => item.instance_id === instance.id) || []
    }));
    
    return NextResponse.json({
      instances: instancesWithItems,
      total_forms: instances.length
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
        error: "Missing required fields: instance_id, item_id, user_id" 
      }, { status: 400 });
    }
    
    const supabase = await createSupabaseServer();
    
    // Verify the item exists
    const { data: item, error: itemError } = await supabase
      .from("form_items")
      .select("*, form_instances!inner(course_id)")
      .eq("id", item_id)
      .eq("instance_id", instance_id)
      .single();
    
    if (itemError || !item) {
      return NextResponse.json({ error: "Invalid item or instance" }, { status: 400 });
    }
    
    // Insert new response (trigger will handle revision logic)
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
      return NextResponse.json({ error: "Failed to save response" }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      response,
      message: `Response saved (revision ${response.revision_number})`
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}