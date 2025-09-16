import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database';

// GET - Load trainee equipment responses for a course
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
    const { searchParams } = new URL(request.url);
    const traineeId = searchParams.get('trainee_id');

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // If trainee_id is provided, verify user is authorized assessor
    if (traineeId) {
      // Check if current user is a trainer/assessor for this course
      const { data: enrolment, error: enrolmentError } = await supabase
        .from('course_assignments')
        .select('role')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .in('role', ['trainer', 'assessor', 'onsite_trainer', 'onsite_assessor'])
        .single();

      if (enrolmentError || !enrolment) {
        return NextResponse.json({ error: 'Unauthorized - not an assessor for this course' }, { status: 403 });
      }
    }

    // Get trainee responses - fallback to empty array if table doesn't exist
    try {
      let query = supabase
        .from('trainee_equipment_responses')
        .select('*')
        .eq('course_id', courseId);

      // Load responses for specified trainee (assessor view) or current user (trainee view)
      const targetUserId = traineeId || user.id;
      query = query.eq('user_id', targetUserId);

      const { data: responses, error } = await query;
      
      if (error && error.code === 'PGRST205') {
        // Table doesn't exist yet, return empty array
        return NextResponse.json([]);
      }
      
      if (error) {
        throw error;
      }

      return NextResponse.json(responses || []);
    } catch (dbError: any) {
      console.error('Database error:', dbError);
      // If table doesn't exist, return empty array instead of error
      if (dbError.code === 'PGRST205') {
        return NextResponse.json([]);
      }
      return NextResponse.json({ error: 'Failed to load responses' }, { status: 500 });
    }

    // This is handled above in the try-catch block
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Save a trainee equipment response
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { equipment_id, response_text } = body;

    if (!equipment_id) {
      return NextResponse.json({ error: 'Equipment ID is required' }, { status: 400 });
    }

    // Verify equipment belongs to this course (using same source as GET route)
    try {
      // Fetch equipment from module content blocks (same as GET route)
      const { data: equipmentBlocks, error: equipmentError } = await supabase
        .from("module_content_blocks")
        .select(`
          *,
          course_modules!inner (
            course_id
          )
        `)
        .eq("kind", "equipment_form")
        .eq("course_modules.course_id", courseId);
      
      if (equipmentError) {
        console.error('Equipment validation error:', equipmentError);
        return NextResponse.json({ error: 'Failed to validate equipment' }, { status: 500 });
      }
      
      // Extract equipment IDs using same logic as GET route
      const validEquipmentIds: string[] = [];
      equipmentBlocks?.forEach((block: any) => {
        if (block.data && Array.isArray(block.data.equipment)) {
          block.data.equipment.forEach((item: any, index: number) => {
            let stableId = item.id;
            if (!stableId) {
              const nameKey = (item.equipment_name || item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
              stableId = `${block.id}_${nameKey}` || `${block.id}_item_${index}`;
            }
            validEquipmentIds.push(stableId);
          });
        }
        
        // Also check legacy format
        if (block.data) {
          const fields = block.data.fields || block.data.items || [];
          fields.forEach((field: any, index: number) => {
            if (field.type === 'equipment' || field.equipment_name) {
              const nameKey = (field.equipment_name || field.name || field.label || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
              const stableId = field.id || `${block.id}_${nameKey}` || `${block.id}_field_${index}`;
              validEquipmentIds.push(stableId);
            }
          });
        }
      });
      
      const equipmentExists = validEquipmentIds.includes(equipment_id);
      if (!equipmentExists) {
        console.log('Equipment validation failed. Valid IDs:', validEquipmentIds, 'Requested ID:', equipment_id);
        return NextResponse.json({ error: 'Equipment not found for this course' }, { status: 400 });
      }
    } catch (error) {
      console.error('Equipment validation error:', error);
      return NextResponse.json({ error: 'Failed to validate equipment' }, { status: 500 });
    }

    // Upsert the response (insert or update if exists)
    const { data, error } = await supabase
      .from('trainee_equipment_responses')
      .upsert({
        user_id: user.id,
        course_id: courseId,
        equipment_id: equipment_id,
        response_text: response_text || '',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, course_id, equipment_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to save response' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}