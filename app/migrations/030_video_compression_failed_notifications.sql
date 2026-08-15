-- Migration 030: notify uploaders when video compression fails
-- 1) Add 'video_compression_failed' to the notif_type enum so the background
--    re-encode worker (lib/video-compression.ts) can send an in-app
--    notification to the uploader when a job exhausts its attempts.
-- 2) Add uploaded_by to video_compression_jobs so the worker knows who to
--    notify (captured from the authenticated user in /api/upload-complete).
--
-- Apply manually in the Supabase SQL editor (same as previous migrations).
-- Safe to run multiple times.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notif_type') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notif_type')
              AND enumlabel = 'video_compression_failed'
        ) THEN
            ALTER TYPE notif_type ADD VALUE 'video_compression_failed';
        END IF;
    END IF;
END $$;

ALTER TABLE public.video_compression_jobs
    ADD COLUMN IF NOT EXISTS uploaded_by uuid;
