-- Migration 031: Add reason column to video_compression_jobs
--
-- Distinguishes format-fix jobs (mislabelled .webm with H.264/HEVC or PCM audio
-- in a Matroska container) from ordinary size-reduction jobs.
--
-- format_fix jobs:
--   - Are queued regardless of file size (even under COMPRESSION_THRESHOLD_BYTES)
--   - Prefer a fast remux (-c:v copy -c:a aac) before falling back to full re-encode
--   - Skip the "output not smaller than original" bail-out (the point is the
--     container change, not the size)
--
-- Default 'compression' keeps all existing rows working without any backfill.

ALTER TABLE video_compression_jobs
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'compression';
