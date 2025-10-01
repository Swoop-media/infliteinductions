import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRoute } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET - Load trainee equipment responses for a course
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;
    const supabase = await createSupabaseRoute();
    const { searchParams } = new URL(request.url);
    const traineeId = searchParams.get('trainee_id');

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // If trainee_id is provided, verify user is authorized
    if (traineeId) {
      // Check if current user has admin role or is a trainer/assessor for this course
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = profile?.role === 'Admin' || profile?.role === 'Trainers and Assessors' || profile?.role === 'Authorization Approver';

      if (!isAdmin) {
        // If not admin, check if they're a trainer/assessor for this course
        const { data: enrolment, error: enrolmentError } = await supabase
          .from('course_assignments')
          .select('role')
          .eq('course_id', courseId)
          .eq('user_id', user.id)
          .in('role', ['trainer', 'assessor', 'onsite_trainer', 'onsite_assessor'])
          .single();

        if (enrolmentError || !enrolment) {
          return NextResponse.json({ error: 'Unauthorized - not an admin or assessor for this course' }, { status: 403 });
        }
      }
    }

    // Get trainee responses - fallback to empty array if table doesn't exist
    try {
      // Use admin client when fetching for another user (admin review)
      const supabaseClient = traineeId ? supabaseAdmin() : supabase;
      
      let query = supabaseClient
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
    const supabase = await createSupabaseRoute();

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
      // Fetch equipment using the SAME logic as the GET /equipment route
      // First try equipment_templates table
      let { data: equipment, error }: any = await supabase
        .from("equipment_templates")
        .select("*")
        .eq("course_id", courseId);
      
      // If equipment_templates doesn't exist or is empty, check module_content_blocks
      if (error?.code === '42P01' || !equipment?.length) {
        const { data: blocks, error: blocksError } = await (supabase as any)
          .from("module_content_blocks")
          .select(`
            *,
            course_modules!inner (
              course_id
            )
          `)
          .eq("kind", "equipment_form")
          .eq("course_modules.course_id", courseId);
        
        if (blocksError) {
          console.error('Equipment validation error:', blocksError);
          return NextResponse.json({ error: 'Failed to validate equipment' }, { status: 500 });
        }
        
        // Extract equipment from blocks or use mock data (same as GET route)
        equipment = [];
        
        // If no real data, use the same mock equipment as GET route
        if (!blocks?.length || !blocks.some((b: any) => b.data?.equipment_templates?.length)) {
          equipment = [
            { id: "visual_altimeter_1", equipment_name: "Visual Altimeter" },
            { id: "audible_altimeter_1", equipment_name: "Audible Altimeter" },
            { id: "helmet_1", equipment_name: "Helmet" },
            { id: "jumpsuit_1", equipment_name: "Jumpsuit" },
            { id: "instructor_cam_1", equipment_name: "Instructor cam glove" },
            { id: "visual_altimeter_2", equipment_name: "Visual Altimeter" }
          ];
        } else {
          // Extract from blocks if they have equipment_templates
          blocks?.forEach((block: any) => {
            if (block.data?.equipment_templates && Array.isArray(block.data.equipment_templates)) {
              equipment!.push(...block.data.equipment_templates);
            }
          });
        }
      }
      
      // Check if the equipment_id is valid
      const validEquipmentIds = equipment.map((item: any) => item.id);
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
    const { data, error } = await (supabase as any)
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