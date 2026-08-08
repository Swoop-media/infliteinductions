-- Migration 022: Add 'document_replaced_review_required' to the notif_type enum
-- Sent to reviewers (Admin, Senior Management) when a learner's document is
-- replaced and a previously approved authorisation assignment is reverted to
-- Pending Approval for re-review. Names the trainee, course, replaced
-- document, and the authorisation now pending review.
--
-- Apply manually in the Supabase SQL editor (same as previous migrations).
-- Safe to run multiple times.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notif_type') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notif_type')
              AND enumlabel = 'document_replaced_review_required'
        ) THEN
            ALTER TYPE notif_type ADD VALUE 'document_replaced_review_required';
        END IF;
    END IF;
END $$;
