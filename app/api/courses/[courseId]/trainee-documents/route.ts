// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { hasRole } from '@/lib/roles';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const supabase = await createSupabaseServer();
    
    // Await params to get courseId (Next.js 15 requirement)
    const { courseId } = await params;
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin, senior management, or has trainer/assessor role for this course
    const isAdmin = await hasRole('Admin') || await hasRole('Senior management');
    
    // Check if user is trainer/assessor for this course
    const { data: trainerAssignments } = await supabase
      .from("course_assignments")
      .select("role")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .in("role", ["onsite_trainer", "onsite_assessor"]);
    
    const isTrainerOrAssessor = trainerAssignments && trainerAssignments.length > 0;

    if (!isAdmin && !isTrainerOrAssessor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get trainee_id from query params
    const searchParams = request.nextUrl.searchParams;
    const traineeId = searchParams.get('trainee_id');
    
    if (!traineeId) {
      return NextResponse.json({ error: 'Trainee ID required' }, { status: 400 });
    }

    // Fetch documents uploaded by the trainee for this course
    const { data: documents, error } = await supabase
      .from('learner_documents')
      .select(`
        id,
        title,
        file_path,
        file_type,
        file_size,
        expires_on,
        created_at,
        module_id
      `)
      .eq('user_id', traineeId)
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    // Get module titles for better context
    const moduleIds = [...new Set(documents?.map(d => d.module_id).filter(Boolean))];
    let moduleMap: Record<string, string> = {};
    
    if (moduleIds.length > 0) {
      const { data: modules } = await supabase
        .from('course_modules')
        .select('id, title')
        .in('id', moduleIds);
      
      if (modules) {
        moduleMap = modules.reduce((acc, m) => {
          acc[m.id] = m.title;
          return acc;
        }, {} as Record<string, string>);
      }
    }

    // Add module titles to documents
    const documentsWithModules = documents?.map(doc => ({
      ...doc,
      module_title: doc.module_id ? moduleMap[doc.module_id] : null
    })) || [];

    return NextResponse.json(documentsWithModules);
  } catch (error) {
    console.error('Error in trainee documents API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}