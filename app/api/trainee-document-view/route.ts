// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { hasRole } from '@/lib/roles';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin, senior management, or trainer/assessor
    const isAdmin = await hasRole('Admin') || await hasRole('Senior management');
    
    // For trainer/assessor, we'll verify they have access to the course
    // But since the filePath doesn't directly contain courseId, we'll rely on role check
    const { data: trainerAssignments } = await supabase
      .from("course_assignments")
      .select("course_id")
      .eq("user_id", user.id)
      .in("role", ["onsite_trainer", "onsite_assessor"]);
    
    const isTrainerOrAssessor = trainerAssignments && trainerAssignments.length > 0;

    if (!isAdmin && !isTrainerOrAssessor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    // Determine which bucket to use based on the file path
    // Learner documents are stored with user ID as the first part of the path
    // Check if the path matches the UUID pattern for user IDs
    const isLearnerDocument = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//.test(filePath);
    const bucketName = isLearnerDocument ? 'learner-documents' : 'course-files';

    console.log('Creating signed URL for trainee document:', { filePath, bucketName });

    // Create a 1-hour signed URL for the document
    const { data, error } = await supabase.storage
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