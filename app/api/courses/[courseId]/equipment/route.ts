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
    console.log('🔍 Fetching equipment for course:', courseId);
    
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
    
    console.log('📊 Equipment blocks found:', equipmentBlocks?.length || 0);
    console.log('📋 Equipment blocks data:', JSON.stringify(equipmentBlocks, null, 2));
    
    if (error) {
      console.error("❌ Error fetching equipment blocks:", error);
      return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
    }
    
    // Extract equipment items from the data field and flatten them
    const equipment: any[] = [];
    equipmentBlocks?.forEach((block: any) => {
      if (block.data) {
        console.log(`🔧 Processing block ${block.id}, data:`, JSON.stringify(block.data, null, 2));
        
        // Check multiple possible locations for equipment data
        const equipmentSources = [
          block.data.equipment,           // Original expected format
          block.data.equipment_templates, // Actual format found in logs
          block.data.items,              // Alternative format
          block.data.fields              // Another alternative
        ];
        
        equipmentSources.forEach((source, sourceIndex) => {
          if (Array.isArray(source)) {
            console.log(`📦 Found equipment source ${sourceIndex} with ${source.length} items`);
            source.forEach((item: any, index: number) => {
              // Generate stable ID that doesn't change with reordering
              let stableId = item.id;
              if (!stableId) {
                // Create a stable ID based on equipment name and block
                const nameKey = (item.equipment_name || item.name || item.label || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
                stableId = `${block.id}_${nameKey}` || `${block.id}_item_${index}`;
              }
              
              console.log(`⚙️ Processing equipment item:`, {
                id: stableId,
                name: item.equipment_name || item.name || item.label,
                required: item.required
              });
              
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
          console.log(`🔨 Found direct equipment in block data`);
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

    console.log('🎯 Final equipment array:', equipment.length, 'items');
    console.log('📝 Equipment details:', JSON.stringify(equipment, null, 2));
    
    // If still no equipment found, let's try to understand the data structure better
    if (equipment.length === 0) {
      console.log('🚨 No equipment found! Let me analyze the block data structure:');
      equipmentBlocks?.forEach((block, i) => {
        console.log(`Block ${i + 1} (${block.id}):`);  
        console.log('- Data keys:', Object.keys(block.data || {}));
        console.log('- Full data:', JSON.stringify(block.data, null, 2));
      });
    }
    
    return NextResponse.json(equipment || []);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}