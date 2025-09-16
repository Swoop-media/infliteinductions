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
      if (block.data && Array.isArray(block.data.equipment)) {
        block.data.equipment.forEach((item: any, index: number) => {
          // Generate stable ID that doesn't change with reordering
          let stableId = item.id;
          if (!stableId) {
            // Create a stable ID based on equipment name and block
            const nameKey = (item.equipment_name || item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
            stableId = `${block.id}_${nameKey}` || `${block.id}_item_${index}`;
          }
          
          equipment.push({
            id: stableId,
            equipment_name: item.equipment_name || item.name,
            description: item.description,
            category: item.category,
            required: item.required || false,
            order_index: item.order_index || index,
            block_id: block.id
          });
        });
      }
    });
    
    // Also try legacy fallback for equipment that might be stored differently
    if (equipment.length === 0 && equipmentBlocks?.length > 0) {
      // Check if equipment data is stored in a different format
      equipmentBlocks.forEach((block: any) => {
        if (block.data) {
          // Check for direct equipment properties
          const fields = block.data.fields || block.data.items || [];
          fields.forEach((field: any, index: number) => {
            if (field.type === 'equipment' || field.equipment_name) {
              const nameKey = (field.equipment_name || field.name || field.label || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
              const stableId = field.id || `${block.id}_${nameKey}` || `${block.id}_field_${index}`;
              
              equipment.push({
                id: stableId,
                equipment_name: field.equipment_name || field.name || field.label,
                description: field.description || field.help_text,
                category: field.category,
                required: field.required || false,
                order_index: field.order_index || index,
                block_id: block.id
              });
            }
          });
        }
      });
    }

    return NextResponse.json(equipment || []);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}