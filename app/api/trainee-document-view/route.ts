// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hasRole } from '@/lib/roles';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filePath, courseId, traineeId } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    if (!courseId || !traineeId) {
      return NextResponse.json({ error: 'Course ID and Trainee ID are required' }, { status: 400 });
    }

    // Check if user is admin, senior management, a trainer/assessor, or has access to this specific course
    const isAdmin = await hasRole('Admin') || await hasRole('Senior management') || await hasRole('Trainers and Assessors');
    
    if (!isAdmin) {
      // Check if user is trainer/assessor for this specific course
      const { data: trainerAssignments } = await supabase
        .from("course_assignments")
        .select("course_id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .in("role", ["onsite_trainer", "onsite_assessor"]);
      
      const hasAccessToCourse = trainerAssignments && trainerAssignments.length > 0;

      if (!hasAccessToCourse) {
        return NextResponse.json({ error: 'Unauthorized - no access to this course' }, { status: 403 });
      }
    }

    // Verify the document belongs to the trainee and course.
    // Use the service client: route-level authorization has already passed above,
    // and caller-scoped RLS on learner_documents only covers own-document reads.
    const { data: document } = await supabaseAdmin()
      .from('learner_documents')
      .select('id, file_path')
      .eq('user_id', traineeId)
      .eq('course_id', courseId)
      .eq('file_path', filePath)
      .single();

    if (!document) {
      return NextResponse.json({ error: 'Document not found or unauthorized' }, { status: 404 });
    }

    // Determine which bucket to use based on the file path
    // Learner documents are stored with user ID as the first part of the path
    // Check if the path matches the UUID pattern for user IDs
    const isLearnerDocument = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//.test(filePath);
    const bucketName = isLearnerDocument ? 'learner-documents' : 'course-files';

    console.log('Creating signed URL for trainee document:', { filePath, bucketName, courseId, traineeId });

    // Create a 1-hour signed URL for the document
    const { data, error } = await supabaseAdmin().storage
      .from(bucketName)
      .createSignedUrl(filePath, 3600); // 1 hour

    if (error) {
      console.error('Error creating signed URL:', error);
      return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (error) {
    console.error('Error in trainee document view API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}