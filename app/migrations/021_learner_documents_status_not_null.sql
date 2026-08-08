-- 021: Backfill any NULL status values on learner_documents and enforce NOT NULL.
--
-- Migration 018 added status text DEFAULT 'active'. PostgreSQL fills the
-- DEFAULT for new rows and for existing rows added after the column was
-- created, but any row inserted between the column creation and the DEFAULT
-- being set may still have NULL. This migration backfills those rows and
-- then locks the column so future inserts cannot produce a NULL, making
-- the replace-flow .neq('status','replaced') filter safe without needing
-- a NULL-specific pass.
--
-- Apply in the Supabase SQL editor (see app/migrations/README convention).

-- Backfill pre-existing NULL rows
UPDATE public.learner_documents
   SET status = 'active'
 WHERE status IS NULL;

-- Enforce NOT NULL going forward
ALTER TABLE public.learner_documents
  ALTER COLUMN status SET NOT NULL;
