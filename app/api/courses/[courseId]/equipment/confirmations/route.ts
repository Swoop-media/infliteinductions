import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/lib/supabase/types';

// GET - Load assessor confirmations for equipment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { searchParams } = new URL(request.url);
    const traineeId = searchParams.get('trainee_id');

    // Get current user (assessor)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is authorized assessor for this course
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

    let query = supabase
      .from('assessor_equipment_confirmations')
      .select('*')
      .eq('course_id', courseId)
      .eq('user_id', user.id);

    // Filter by trainee if specified
    if (traineeId) {
      query = query.eq('trainee_id', traineeId);
    }

    const { data: confirmations, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to load confirmations' }, { status: 500 });
    }

    return NextResponse.json(confirmations || []);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Save an assessor equipment confirmation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Get current user (assessor)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is authorized assessor for this course
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

    const body = await request.json();
    const { trainee_id, equipment_id, confirmed, assessor_notes } = body;

    if (!trainee_id || !equipment_id) {
      return NextResponse.json({ error: 'Trainee ID and Equipment ID are required' }, { status: 400 });
    }

    // Verify trainee is enrolled in this course
    const { data: traineeEnrolment, error: traineeError } = await supabase
      .from('course_assignments')
      .select('role')
      .eq('course_id', courseId)
      .eq('user_id', trainee_id)
      .eq('role', 'trainee')
      .single();

    if (traineeError || !traineeEnrolment) {
      return NextResponse.json({ error: 'Trainee not enrolled in this course' }, { status: 400 });
    }

    // Verify equipment belongs to this course (fail-closed)
    try {
      const equipmentResponse = await fetch(`${request.nextUrl.origin}/api/courses/${courseId}/equipment`);
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

    // Upsert the confirmation (insert or update if exists)
    const { data, error } = await supabase
      .from('assessor_equipment_confirmations')
      .upsert({
        user_id: user.id,
        trainee_id: trainee_id,
        course_id: courseId,
        equipment_id: equipment_id,
        confirmed: confirmed || false,
        assessor_notes: assessor_notes || '',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, trainee_id, course_id, equipment_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to save confirmation' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}