// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { hasRole } from "@/lib/roles";
import {
  COMPRESSION_THRESHOLD_BYTES,
  enqueueVideoCompression,
  kickVideoCompressionWorker,
} from "@/lib/video-compression";

export const runtime = 'nodejs';

/**
 * Sniff the uploaded video's actual container/codecs from its raw bytes.
 * Extension checks alone are not enough: screen recorders produce ".webm"
 * files containing H.264 (Matroska CodecID "V_MPEG4/ISO/AVC"), and MP4s can
 * carry HEVC — both fail in browsers with "couldn't be played on this device".
 * Returns an error string when the content is known-unplayable, else null.
 * Inconclusive sniffs are allowed through (never block on uncertainty).
 */
async function sniffVideoProblems(supabase: any, storagePath: string): Promise<string | null> {
  try {
    const { data: signed } = await supabase.storage
      .from('course-files')
      .createSignedUrl(storagePath, 300);
    if (!signed?.signedUrl) return null;

    const fetchRange = async (range: string) => {
      const res = await fetch(signed.signedUrl, { headers: { Range: range } });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    };

    const head = await fetchRange('bytes=0-262143'); // first 256KB
    if (!head || head.length < 12) return null;

    const isMatroska = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    const isMp4 = head.subarray(4, 8).toString('latin1') === 'ftyp';

    if (isMatroska) {
      const text = head.toString('latin1');
      if (text.includes('V_MPEG4/ISO/AVC') || text.includes('V_MPEGH/ISO/HEVC')) {
        return 'This .webm file actually contains H.264/HEVC video (a common screen-recorder quirk), which browsers cannot play in a WebM container. Please re-export it as an MP4 (H.264) and upload that instead.';
      }
      if (/A_PCM/.test(text)) {
        return 'This video contains uncompressed PCM audio, which browsers cannot play. Please re-export it as an MP4 (H.264 video + AAC audio) and upload that instead.';
      }
      return null;
    }

    if (isMp4) {
      // Codec atoms live in the moov box, which may be at the start or end.
      let text = head.toString('latin1');
      if (!text.includes('avc1') && !text.includes('hvc1') && !text.includes('hev1')) {
        const tail = await fetchRange('bytes=-262144'); // last 256KB
        if (tail) text += tail.toString('latin1');
      }
      const hasHevc = text.includes('hvc1') || text.includes('hev1');
      const hasH264 = text.includes('avc1') || text.includes('avc3');
      if (hasHevc && !hasH264) {
        return 'This video uses HEVC (H.265), which many browsers cannot play. Please re-export it as an MP4 with H.264 video and upload that instead. On iPhone: Settings → Camera → Formats → "Most Compatible", or export as H.264 from your editor.';
      }
      return null;
    }

    return null;
  } catch (err) {
    console.error('Video sniff error (allowing upload):', err);
    return null;
  }
}

/**
 * Look up the actual size of an uploaded storage object. Returns null when
 * the size cannot be determined (never blocks on uncertainty — the
 * signed-URL route already rejected oversized declared sizes).
 */
async function getStoredObjectSize(supabase: any, storagePath: string): Promise<number | null> {
  try {
    const lastSlash = storagePath.lastIndexOf('/');
    const folder = storagePath.substring(0, lastSlash);
    const name = storagePath.substring(lastSlash + 1);
    const { data, error } = await supabase.storage
      .from('course-files')
      .list(folder, { search: name, limit: 1 });
    if (error || !data?.length) return null;
    const size = data[0]?.metadata?.size;
    return typeof size === 'number' ? size : null;
  } catch (err) {
    console.error('Stored object size lookup error (allowing upload):', err);
    return null;
  }
}

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

    // Authorization-critical: the client supplies storagePath, so bind it to
    // the module being modified BEFORE any size/sniff/queue/delete operation.
    // Signed-URL uploads are always issued as
    //   module-(images|videos|files)/<moduleId>/<uuid>.<ext>
    // Without this check, a creator could pass another course's object path
    // and have the privileged handlers (and the compression worker) operate
    // on — and overwrite or delete — someone else's file.
    const expectedPrefix =
      uploadType === 'image' ? 'module-images' :
      uploadType === 'video' ? 'module-videos' :
      'module-files';
    const pathPattern = new RegExp(
      `^${expectedPrefix}/${moduleId}/[0-9a-fA-F-]{36}\\.[A-Za-z0-9]{1,8}$`
    );
    if (typeof storagePath !== 'string' || !pathPattern.test(storagePath)) {
      return NextResponse.json(
        { error: 'Invalid storage path for this module' },
        { status: 400 }
      );
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
      // Enforce the 300MB video cap against the ACTUAL stored object size.
      // The signed-URL route only sees the client-declared fileSize, so this
      // is the authoritative server-side check (upload bypasses our server).
      const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
      const actualSize = await getStoredObjectSize(supabase, storagePath);
      if (actualSize !== null && actualSize > MAX_VIDEO_BYTES) {
        // Remove the oversized upload so it doesn't linger in storage
        await supabase.storage.from('course-files').remove([storagePath]).catch(() => {});
        return NextResponse.json({
          error: `This video is ${(actualSize / 1024 / 1024).toFixed(0)}MB — the limit is 300MB. Please compress it first: export at 1080p using H.264 (a 5-minute video should be well under 200MB), then upload the compressed file.`
        }, { status: 413 });
      }

      // Reject content browsers can't play, even when the extension looks fine
      const sniffError = await sniffVideoProblems(supabase, storagePath);
      if (sniffError) {
        // Clean up the unusable upload so it doesn't linger in storage
        await supabase.storage.from('course-files').remove([storagePath]).catch(() => {});
        return NextResponse.json({ error: sniffError }, { status: 400 });
      }
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

      // Oversized (but under-cap) videos: queue a background re-encode to
      // 1080p H.264 CRF23 +faststart, replaced at the same storage path.
      // Non-blocking: enqueue never throws and the worker runs after the
      // response is sent.
      let compressionQueued = false;
      if (actualSize !== null && actualSize > COMPRESSION_THRESHOLD_BYTES) {
        compressionQueued = await enqueueVideoCompression({
          storagePath,
          blockId,
          moduleId,
          originalBytes: actualSize,
          uploadedBy: user.id,
        });
        if (compressionQueued) kickVideoCompressionWorker();
      }

      return NextResponse.json({
        success: true,
        url: videoUrl,
        path: storagePath,
        compressionQueued,
      });
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