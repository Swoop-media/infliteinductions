-- Migration 008: Add 'auth_autofix_report' to the notif_type enum
-- Used by the automatic authorisation fix sweep to send admins an in-app
-- summary of stuck authorisations that were corrected automatically.
--
-- Apply manually in the Supabase SQL editor (same as previous migrations).
-- Safe to run multiple times.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notif_type') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notif_type')
              AND enumlabel = 'auth_autofix_report'
        ) THEN
            ALTER TYPE notif_type ADD VALUE 'auth_autofix_report';
        END IF;
    END IF;
END $$;
