// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export const runtime = 'nodejs';
export const maxDuration = 30;

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

    const { fileName, fileSize, contentType, moduleId, uploadType = 'file' } = await request.json();
    
    if (!fileName || !fileSize || !moduleId) {
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
    // Users can modify if they are admin/senior management OR if they created the course
    const isAdmin = (await hasRole("Admin")) || (await hasRole("Senior management"));
    const isOwner = moduleData.courses?.created_by === user.id;
    
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'You do not have permission to modify this course' }, { status: 403 });
    }

    // Check file size limits based on upload type
    const maxSize = uploadType === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024; // 10MB for images, 100MB for files
    if (fileSize > maxSize) {
      const limitMB = uploadType === 'image' ? 10 : 100;
      return NextResponse.json({ 
        error: `File size (${(fileSize / 1024 / 1024).toFixed(1)}MB) exceeds the ${limitMB}MB limit. Please use a smaller file.` 
      }, { status: 413 });
    }

    // Block PowerPoint files
    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.endsWith('.ppt') || lowerFileName.endsWith('.pptx')) {
      return NextResponse.json({ 
        error: 'PowerPoint files are not supported. Please convert to PDF before uploading.' 
      }, { status: 400 });
    }

    // Generate unique filename with path based on upload type
    const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".") + 1) : "bin";
    const pathPrefix = uploadType === 'image' ? 'module-images' : 'module-files';
    const storagePath = `${pathPrefix}/${moduleId}/${crypto.randomUUID()}.${ext}`;
    
    // Generate signed URL for upload (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('course-files')
      .createSignedUploadUrl(storagePath, {
        expiresIn: 3600, // 1 hour
      });

    if (signedUrlError || !signedUrlData) {
      return NextResponse.json({ error: 'Failed to create signed URL for upload' }, { status: 500 });
    }

    return NextResponse.json({ 
      uploadUrl: signedUrlData.signedUrl,
      path: storagePath,
      token: signedUrlData.token
    });
  } catch (error) {
    console.error('Signed URL generation error:', error);
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 });
  }
}