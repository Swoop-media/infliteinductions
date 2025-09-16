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
    
    // Fetch equipment requirements from module content blocks
    const { data: equipmentBlocks, error } = await supabase
      .from("module_content_blocks")
      .select(`
        *,
        course_modules!inner (
          course_id,
          title
        )
      `)
      .eq("kind", "equipment_form")
      .eq("course_modules.course_id", courseId)
      .order("order_index", { ascending: true });
    
    if (error) {
      console.error("Error fetching equipment blocks:", error);
      return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
    }
    
    // Extract equipment items from the data field and flatten them
    const equipment: any[] = [];
    equipmentBlocks?.forEach((block: any) => {
      if (block.data) {
        // Check multiple possible locations for equipment data
        const equipmentSources = [
          block.data.equipment,           // Original expected format
          block.data.equipment_templates, // Most common format
          block.data.items,              // Alternative format
          block.data.fields              // Another alternative
        ];
        
        equipmentSources.forEach((source) => {
          if (Array.isArray(source)) {
            source.forEach((item: any, index: number) => {
              // Generate stable ID that doesn't change with reordering
              let stableId = item.id;
              if (!stableId) {
                // Create a stable ID based on equipment name and block
                const nameKey = (item.equipment_name || item.name || item.label || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
                stableId = `${block.id}_${nameKey}` || `${block.id}_item_${index}`;
              }
              
              equipment.push({
                id: stableId,
                equipment_name: item.equipment_name || item.name || item.label,
                description: item.description || item.help_text,
                category: item.category,
                required: item.required || false,
                order_index: item.order_index || index,
                block_id: block.id
              });
            });
          }
        });
        
        // Also check if the block itself contains equipment properties directly
        if (block.data.equipment_name || block.data.name) {
          const nameKey = (block.data.equipment_name || block.data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
          const stableId = block.data.id || `${block.id}_${nameKey}` || `${block.id}_direct`;
          
          equipment.push({
            id: stableId,
            equipment_name: block.data.equipment_name || block.data.name,
            description: block.data.description,
            category: block.data.category,
            required: block.data.required || false,
            order_index: block.data.order_index || 0,
            block_id: block.id
          });
        }
      }
    });

    return NextResponse.json(equipment || []);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}