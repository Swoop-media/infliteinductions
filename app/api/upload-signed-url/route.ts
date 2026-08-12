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

    // Check file size limits based on upload type.
    // Videos are hard-capped at 300MB: raw/uncompressed uploads (seen up to
    // 1.7GB) load extremely slowly for learners and strain storage/disk IO.
    // Note this checks the client-declared fileSize; the actual stored object
    // size is re-verified server-side in /api/upload-complete.
    const maxSize =
      uploadType === 'image' ? 10 * 1024 * 1024 :
      uploadType === 'video' ? 300 * 1024 * 1024 : // 300MB hard cap for videos
      100 * 1024 * 1024; // 100MB for files
    if (fileSize > maxSize) {
      if (uploadType === 'video') {
        return NextResponse.json({
          error: `This video is ${(fileSize / 1024 / 1024).toFixed(0)}MB — the limit is 300MB. Please compress it first: export at 1080p using H.264 (a 5-minute video should be well under 200MB), then upload the compressed file.`
        }, { status: 413 });
      }
      const limitLabel = uploadType === 'image' ? '10MB' : '100MB';
      return NextResponse.json({ 
        error: `File size (${(fileSize / 1024 / 1024).toFixed(1)}MB) exceeds the ${limitLabel} limit. Please use a smaller file.` 
      }, { status: 413 });
    }

    // Videos must be in a browser-safe container. Formats like .mov, .mkv and
    // .avi often contain codecs browsers can't play (HEVC, PCM audio, etc.),
    // which caused "This video couldn't be played on this device" for learners.
    if (uploadType === 'video') {
      const videoExts = ['mp4', 'm4v', 'webm'];
      const extCheck = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
      if (!videoExts.includes(extCheck)) {
        return NextResponse.json({ 
          error: 'Unsupported video format. Please upload an MP4 (H.264) file — every video editor and phone can export this. WebM is also accepted. Other formats (e.g. MOV, MKV, AVI) often fail to play on learners\' devices.' 
        }, { status: 400 });
      }
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
    const pathPrefix = uploadType === 'image' ? 'module-images' : uploadType === 'video' ? 'module-videos' : 'module-files';
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