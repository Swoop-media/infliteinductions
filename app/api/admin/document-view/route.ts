
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { hasRole } from '@/lib/roles';

export async function POST(request: NextRequest) {
  try {
    // Check if user is admin
    const isAdmin = await hasRole('Admin');
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    const supabase = await createSupabaseServer();

    // Create a 1-hour signed URL for the document
    const { data, error } = await supabase.storage
      .from('course-files')
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
