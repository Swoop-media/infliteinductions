import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database';

// GET - Load trainee equipment responses for a course
export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
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
        .eq('course_id', params.courseId)
        .eq('user_id', user.id)
        .in('role', ['trainer', 'assessor', 'onsite_trainer', 'onsite_assessor'])
        .single();

      if (enrolmentError || !enrolment) {
        return NextResponse.json({ error: 'Unauthorized - not an assessor for this course' }, { status: 403 });
      }
    }

    // Get trainee responses
    let query = supabase
      .from('trainee_equipment_responses')
      .select('*')
      .eq('course_id', params.courseId);

    // Load responses for specified trainee (assessor view) or current user (trainee view)
    const targetUserId = traineeId || user.id;
    query = query.eq('user_id', targetUserId);

    const { data: responses, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to load responses' }, { status: 500 });
    }

    return NextResponse.json(responses || []);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Save a trainee equipment response
export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

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

    // Verify equipment belongs to this course (fail-closed)
    try {
      const equipmentResponse = await fetch(`${request.nextUrl.origin}/api/courses/${params.courseId}/equipment`);
      if (!equipmentResponse.ok) {
        console.error('Equipment API failed:', equipmentResponse.status);
        return NextResponse.json({ error: 'Failed to validate equipment' }, { status: 502 });
      }
      const equipmentList = await equipmentResponse.json();
      const equipmentExists = equipmentList.some((eq: any) => eq.id === equipment_id);
      if (!equipmentExists) {
        return NextResponse.json({ error: 'Equipment not found for this course' }, { status: 400 });
      }
    } catch (error) {
      console.error('Equipment validation error:', error);
      return NextResponse.json({ error: 'Failed to validate equipment' }, { status: 502 });
    }

    // Upsert the response (insert or update if exists)
    const { data, error } = await supabase
      .from('trainee_equipment_responses')
      .upsert({
        user_id: user.id,
        course_id: params.courseId,
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