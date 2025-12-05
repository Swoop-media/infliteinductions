// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole } from "@/lib/roles";

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canAccess =
      (await hasRole("Course Creators")) ||
      (await hasRole("Senior management")) ||
      (await hasRole("Admin"));
    
    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const noticeId = formData.get('noticeId') as string;
    const fileType = formData.get('fileType') as string;
    
    if (!file || !noticeId) {
      return NextResponse.json({ error: 'Missing file or notice ID' }, { status: 400 });
    }

    const maxSize = fileType === 'image' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      const limitMB = fileType === 'image' ? 10 : 50;
      return NextResponse.json({ 
        error: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the ${limitMB}MB limit.` 
      }, { status: 413 });
    }

    const originalFileName = file.name.toLowerCase();
    if (originalFileName.endsWith('.ppt') || originalFileName.endsWith('.pptx')) {
      return NextResponse.json({ 
        error: 'PowerPoint files are not supported. Please convert to PDF before uploading.' 
      }, { status: 400 });
    }

    if (fileType === 'image' && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid image file type' }, { status: 400 });
    }

    if (fileType === 'pdf' && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed for document attachments' }, { status: 400 });
    }

    const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".") + 1) : (fileType === 'image' ? 'png' : 'pdf');
    const folder = fileType === 'image' ? 'notice-images' : 'notice-documents';
    const fileName = `${folder}/${noticeId}/${crypto.randomUUID()}.${ext}`;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('course-files')
      .upload(fileName, buffer, {
        contentType: file.type || (fileType === 'image' ? 'image/png' : 'application/pdf'),
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('course-files')
      .createSignedUrl(fileName, 365 * 24 * 60 * 60);

    if (signedUrlError || !signedUrlData) {
      return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 });
    }

    return NextResponse.json({ 
      url: signedUrlData.signedUrl,
      path: fileName,
      originalName: file.name,
      fileType: fileType
    });
  } catch (error) {
    console.error('Notice file upload error:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
