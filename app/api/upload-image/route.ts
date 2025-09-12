// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";

// Configure the API route to handle larger files
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

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const moduleId = formData.get('moduleId') as string;
    
    if (!file || !moduleId) {
      return NextResponse.json({ error: 'Missing file or module ID' }, { status: 400 });
    }

    // Check file size (limit to 10MB for documents)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit. Please use a smaller file.` 
      }, { status: 413 });
    }

    // Block PowerPoint files
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
      return NextResponse.json({ 
        error: 'PowerPoint files are not supported. Please convert to PDF before uploading.' 
      }, { status: 400 });
    }

    // Generate unique filename
    const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".") + 1) : "png";
    const fileName = `module-images/${moduleId}/${crypto.randomUUID()}.${ext}`;
    
    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from('course-files')
      .upload(fileName, buffer, {
        contentType: file.type || 'image/png',
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Create a signed URL (valid for 1 year)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('course-files')
      .createSignedUrl(fileName, 365 * 24 * 60 * 60); // 1 year in seconds

    if (signedUrlError || !signedUrlData) {
      return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 });
    }

    return NextResponse.json({ 
      url: signedUrlData.signedUrl,
      path: fileName 
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}