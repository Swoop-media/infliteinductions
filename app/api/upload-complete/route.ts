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
 *
 * Returns:
 *   null                                         — no problem detected
 *   { error, formatFix: true, reason }           — unplayable but fixable by
 *     the transcode pipeline; caller enqueues with the given reason:
 *       'format_fix_h264' — H.264-in-Matroska: fast remux (-c:v copy) is safe
 *       'format_fix_hevc' — HEVC-in-Matroska: must full-re-encode to H.264
 *       'format_fix_pcm'  — PCM audio in Matroska: re-encode audio to AAC
 *   { error, formatFix: false }                  — not auto-fixable; reject
 *
 * Inconclusive sniffs are allowed through (never block on uncertainty).
 */
async function sniffVideoProblems(
  supabase: any,
  storagePath: string
): Promise<{
  error: string;
  formatFix: boolean;
  reason?: 'format_fix_h264' | 'format_fix_hevc' | 'format_fix_pcm';
} | null> {
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
      // HEVC check must come first — some files declare both CodecIDs.
      if (text.includes('V_MPEGH/ISO/HEVC')) {
        // HEVC-in-Matroska — auto-fixable but requires full re-encode (HEVC→H.264).
        return {
          error: 'This .webm file actually contains HEVC (H.265) video in a Matroska container (a common screen-recorder quirk). It\'s being queued for automatic conversion — the video will be playable once the conversion finishes.',
          formatFix: true,
          reason: 'format_fix_hevc' as const,
        };
      }
      if (text.includes('V_MPEG4/ISO/AVC')) {
        // H.264-in-Matroska — auto-fixable via fast remux (stream-copy video, re-encode audio).
        return {
          error: 'This .webm file actually contains H.264 video in a Matroska container (a common screen-recorder quirk). It\'s being queued for automatic conversion — the video will be playable once the conversion finishes.',
          formatFix: true,
          reason: 'format_fix_h264' as const,
        };
      }
      if (/A_PCM/.test(text)) {
        // PCM audio in Matroska — auto-fixable via re-encode to AAC.
        return {
          error: 'This video contains uncompressed PCM audio in a Matroska container. It\'s being queued for automatic conversion — the video will be playable once the conversion finishes.',
          formatFix: true,
          reason: 'format_fix_pcm' as const,
        };
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
        return {
          error: 'This video uses HEVC (H.265), which many browsers cannot play. Please re-export it as an MP4 with H.264 video and upload that instead. On iPhone: Settings → Camera → Formats → "Most Compatible", or export as H.264 from your editor.',
          formatFix: false,
        };
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

      // Detect known-unplayable containers/codecs.
      // formatFix=true  → fixable by the transcode pipeline; enqueue instead of reject.
      // formatFix=false → not auto-fixable (e.g. HEVC-in-MP4); delete & reject.
      const sniffResult = await sniffVideoProblems(supabase, storagePath);
      if (sniffResult && !sniffResult.formatFix) {
        // Non-fixable format problem — clean up and reject.
        await supabase.storage.from('course-files').remove([storagePath]).catch(() => {});
        return NextResponse.json({ error: sniffResult.error }, { status: 400 });
      }
      // sniffResult?.formatFix === true → fall through; job will be queued below.

      const { data: block, error: blockFetchError } = await supabase
        .from("module_content_blocks")
        .select("data")
        .eq("id", blockId)
        .maybeSingle();

      if (blockFetchError) {
        return NextResponse.json({ error: blockFetchError.message }, { status: 500 });
      }

      // Queue a background job when needed.  Two cases:
      //
      // 1. format_fix: mislabelled .webm (H.264/HEVC or PCM audio in Matroska)
      //    — queue regardless of size; worker remuxes/re-encodes to a playable
      //    .mp4 and renames the storage path. The source file is UNPLAYABLE in
      //    browsers, so we must NOT point the block at it: the block URL is
      //    kept empty (with a pending_format_fix marker) until the worker
      //    finishes and populates it with the playable .mp4. Learner-facing
      //    renderers show a "video processing" placeholder off the marker.
      //
      // 2. compression: oversized (>100 MB) but otherwise fine video — queue
      //    for size reduction. The original is playable, so the block points
      //    at it immediately.
      //
      // Non-blocking: enqueue never throws and the worker runs after the
      // response is sent.
      //
      // ORDERING (race-critical): for format-fix uploads the block row is
      // written with the held state (url: null + pending_format_fix marker)
      // BEFORE the job row is inserted. The job only becomes claimable —
      // by the local kick, the cron endpoint, or any other worker entry
      // point — once the marker is already committed, so the worker can
      // never complete a job while the block shows neither URL nor marker.
      // If the enqueue then fails (e.g. queue table not migrated), we roll
      // the block back to pointing at the original file so it isn't lost
      // and no orphaned "processing" placeholder remains.
      const videoUrl = `/app/files/${storagePath}`;
      const baseData = { ...(block?.data || {}), display: displayName || 'Uploaded video' };
      const pointedData = (() => {
        const d = { ...baseData, url: videoUrl };
        delete d.pending_format_fix;
        return d;
      })();
      const heldData = { ...baseData, url: null, pending_format_fix: storagePath };

      let compressionQueued = false;
      let holdUrl = false;

      const writeBlock = async (data: any) =>
        (await supabase.from("module_content_blocks").update({ data }).eq("id", blockId)).error;

      if (sniffResult?.formatFix) {
        // 1) Commit the held state first.
        const heldErr = await writeBlock(heldData);
        if (heldErr) {
          return NextResponse.json({ error: heldErr.message }, { status: 500 });
        }
        holdUrl = true;
        // 2) Now make the job claimable. 'already_active' (e.g. a retried
        // upload-complete request after a lost response — same storagePath,
        // job from the first request still queued/processing) means the file
        // IS covered by an active job: keep the hold and re-kick the worker.
        // Only a genuine 'failed' (no job exists or can be created) rolls
        // the block back.
        const enqueueResult = await enqueueVideoCompression({
          storagePath,
          blockId,
          moduleId,
          originalBytes: actualSize,
          uploadedBy: user.id,
          reason: sniffResult.reason ?? 'format_fix_h264',
        });
        compressionQueued = enqueueResult === 'queued' || enqueueResult === 'already_active';
        if (compressionQueued) {
          kickVideoCompressionWorker();
        } else {
          // Enqueue failed — no worker will ever populate the URL. Roll the
          // block back to the original file (old behaviour) so the upload
          // isn't lost behind a permanent "processing" placeholder.
          const rollbackErr = await writeBlock(pointedData);
          if (rollbackErr) {
            console.error(
              `[upload-complete] format-fix enqueue failed AND rollback failed for ${storagePath}:`,
              rollbackErr.message
            );
            return NextResponse.json({ error: rollbackErr.message }, { status: 500 });
          }
          holdUrl = false;
        }
      } else {
        const updateError = await writeBlock(pointedData);
        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
      }

      revalidatePath(`/app/creator/modules/${moduleId}`);

      if (!sniffResult?.formatFix && actualSize !== null && actualSize > COMPRESSION_THRESHOLD_BYTES) {
        // Size-reduction job.
        const sizeEnqueueResult = await enqueueVideoCompression({
          storagePath,
          blockId,
          moduleId,
          originalBytes: actualSize,
          uploadedBy: user.id,
          reason: 'compression',
        });
        compressionQueued = sizeEnqueueResult === 'queued' || sizeEnqueueResult === 'already_active';
        if (compressionQueued) kickVideoCompressionWorker();
      }

      return NextResponse.json({
        success: true,
        url: holdUrl ? null : videoUrl,
        path: storagePath,
        compressionQueued,
        processing: holdUrl,
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