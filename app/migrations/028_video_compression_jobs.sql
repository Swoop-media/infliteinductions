-- Migration 028: video_compression_jobs queue table
-- Backs the automatic background re-encode of oversized module videos
-- (>100MB uploads to module-videos/ are re-encoded to 1080p H.264 CRF23
-- +faststart and replaced in place; see lib/video-compression.ts).
--
-- Apply manually in the Supabase SQL editor (same as previous migrations).
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.video_compression_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_path text NOT NULL,
    block_id uuid,
    module_id uuid,
    original_bytes bigint,
    output_bytes bigint,
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'done', 'skipped', 'failed')),
    attempts integer NOT NULL DEFAULT 0,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS video_compression_jobs_status_idx
    ON public.video_compression_jobs (status, created_at);

-- Service-role only access: enable RLS with no policies so browser clients
-- cannot read or write the queue (same pattern as other admin-only tables).
ALTER TABLE public.video_compression_jobs ENABLE ROW LEVEL SECURITY;
