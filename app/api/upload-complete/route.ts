// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { moduleId, blockId, storagePath, displayName, uploadType = 'file' } = await request.json();
    
    if (!moduleId || !storagePath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (uploadType === 'file' && blockId) {
      // This is for file block uploads - update the module content block
      const { error: updateError } = await supabase
        .from("module_content_blocks")
        .update({ data: { storage_path: storagePath, display: displayName || 'Uploaded file' } })
        .eq("id", blockId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // Revalidate the module page
      revalidatePath(`/app/creator/modules/${moduleId}`);
    }

    // For images, we need to return a signed URL for display
    if (uploadType === 'image') {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('course-files')
        .createSignedUrl(storagePath, 365 * 24 * 60 * 60); // 1 year in seconds

      if (signedUrlError || !signedUrlData) {
        return NextResponse.json({ error: 'Failed to create signed URL for display' }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true,
        url: signedUrlData.signedUrl,
        path: storagePath 
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Upload completion error:', error);
    return NextResponse.json({ error: 'Failed to complete upload' }, { status: 500 });
  }
}