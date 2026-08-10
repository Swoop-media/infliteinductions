// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { hasRole } from '@/lib/roles';

export async function POST(request: NextRequest) {
  try {
    // Allow the roles that can reach the pages using this endpoint:
    // Admin (user management pages), Senior management, and Authorization
    // Approver (the authorisation review page).
    let allowed = false;
    for (const roleName of ['Admin', 'Senior management', 'Authorization Approver']) {
      if (await hasRole(roleName)) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServer();

    // Determine which bucket to use based on the file path
    // Learner documents are stored with user ID as the first part of the path
    // Check if the path matches the UUID pattern for user IDs
    const isLearnerDocument = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//.test(filePath);
    const bucketName = isLearnerDocument ? 'learner-documents' : 'course-files';

    console.log('Creating signed URL:', { filePath, bucketName });

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
    console.error('Error in document view API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
