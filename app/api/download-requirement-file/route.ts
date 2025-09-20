// @ts-nocheck

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');
    
    if (!filePath) {
      return NextResponse.json({ error: 'File path required' }, { status: 400 });
    }

    // Security check: ensure the path is within requirement-uploads
    if (!filePath.includes('requirement-uploads')) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
    }

    // Generate a signed URL for the file
    const { data, error } = await supabase.storage
      .from('course-files')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error || !data) {
      console.error('Error creating signed URL:', error);
      return NextResponse.json({ 
        error: 'Failed to access file' 
      }, { status: 500 });
    }

    // Redirect to the signed URL
    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to download file' 
    }, { status: 500 });
  }
}