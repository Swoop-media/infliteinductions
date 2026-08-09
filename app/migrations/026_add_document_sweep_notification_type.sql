-- Migration 026: Add 'document_sweep_report' to the notif_type enum
-- Used by the scheduled stranded-file document sweep (/api/cron/document-sweep)
-- to send admins an in-app summary of deleted stranded upload files.
--
-- Apply manually in the Supabase SQL editor (same as previous migrations).
-- Safe to run multiple times.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notif_type') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notif_type')
              AND enumlabel = 'document_sweep_report'
        ) THEN
            ALTER TYPE notif_type ADD VALUE 'document_sweep_report';
        END IF;
    END IF;
END $$;
