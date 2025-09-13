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

    const { moduleId, blockId } = await request.json();
    
    if (!moduleId || !blockId) {
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

    // Verify that the block belongs to this module and get current file info
    const { data: blockData, error: blockError } = await supabase
      .from("module_content_blocks")
      .select("id, module_id, data")
      .eq("id", blockId)
      .eq("module_id", moduleId)
      .maybeSingle();
      
    if (blockError || !blockData) {
      return NextResponse.json({ error: 'Block not found or does not belong to this module' }, { status: 404 });
    }

    // Extract old path from the validated block data
    const oldPath: string | null = blockData?.data?.storage_path ?? null;

    // Clear the file reference in database
    const { error } = await supabase
      .from("module_content_blocks")
      .update({ data: { storage_path: null, display: "" } })
      .eq("id", blockId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Remove the file from storage if it exists
    if (oldPath) {
      try {
        await supabase.storage.from("course-files").remove([oldPath]);
      } catch (storageError) {
        // Log error but don't fail the request
        console.warn('Failed to remove file from storage:', storageError);
      }
    }

    // Revalidate the module page
    revalidatePath(`/app/creator/modules/${moduleId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Clear file block error:', error);
    return NextResponse.json({ error: 'Failed to clear file' }, { status: 500 });
  }
}