// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { hasRole } from "@/lib/roles";

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has creator roles
    const hasCreatorRole = 
      (await hasRole("Course Creators")) ||
      (await hasRole("Senior management")) ||
      (await hasRole("Admin"));
    
    if (!hasCreatorRole) {
      return NextResponse.json({ error: 'Insufficient permissions. Creator role required.' }, { status: 403 });
    }

    const { moduleId, blockId, storagePath, displayName, uploadType = 'file' } = await request.json();
    
    if (!moduleId || !storagePath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify module exists and get course information for authorization
    const { data: moduleData, error: moduleError } = await supabase
      .from("course_modules")
      .select("id, course_id, courses!inner(id, created_by)")
      .eq("id", moduleId)
      .maybeSingle();
      
    if (moduleError || !moduleData) {
      return NextResponse.json({ error: 'Module not found or access denied' }, { status: 404 });
    }

    // Additional authorization: Check if user can modify this course
    const isAdmin = (await hasRole("Admin")) || (await hasRole("Senior management"));
    const isOwner = moduleData.courses?.created_by === user.id;
    
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'You do not have permission to modify this course' }, { status: 403 });
    }

    // If blockId is provided, verify it belongs to this module
    if (blockId) {
      const { data: blockData, error: blockError } = await supabase
        .from("module_content_blocks")
        .select("id, module_id, kind")
        .eq("id", blockId)
        .eq("module_id", moduleId)
        .maybeSingle();
        
      if (blockError || !blockData) {
        return NextResponse.json({ error: 'Block not found or does not belong to this module' }, { status: 404 });
      }

      // Uploads may only be written onto the matching block type
      if (uploadType === 'video' && blockData.kind !== 'video_embed') {
        return NextResponse.json({ error: 'Video uploads can only be attached to video blocks' }, { status: 400 });
      }
      if (uploadType === 'file' && blockData.kind !== 'file') {
        return NextResponse.json({ error: 'File uploads can only be attached to file blocks' }, { status: 400 });
      }
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

    // Video uploads: point the video block at the internal file proxy URL,
    // preserving other block settings like gate_seconds
    if (uploadType === 'video' && blockId) {
      const { data: block, error: blockFetchError } = await supabase
        .from("module_content_blocks")
        .select("data")
        .eq("id", blockId)
        .maybeSingle();

      if (blockFetchError) {
        return NextResponse.json({ error: blockFetchError.message }, { status: 500 });
      }

      const videoUrl = `/app/files/${storagePath}`;
      const newData = { ...(block?.data || {}), url: videoUrl, display: displayName || 'Uploaded video' };
      const { error: updateError } = await supabase
        .from("module_content_blocks")
        .update({ data: newData })
        .eq("id", blockId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      revalidatePath(`/app/creator/modules/${moduleId}`);
      return NextResponse.json({ success: true, url: videoUrl, path: storagePath });
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