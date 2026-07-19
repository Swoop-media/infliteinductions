-- Migration 011: Add 'authorisation_approved_responsible' to the notif_type enum
-- Sent to the authorisation's Responsible Person when a pending authorisation
-- is approved. Includes approver, authorisation title, expiry date, learner
-- name, and any restrictions/comments recorded at approval time.
--
-- Apply manually in the Supabase SQL editor (same as previous migrations).
-- Safe to run multiple times.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notif_type') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notif_type')
              AND enumlabel = 'authorisation_approved_responsible'
        ) THEN
            ALTER TYPE notif_type ADD VALUE 'authorisation_approved_responsible';
        END IF;
    END IF;
END $$;
