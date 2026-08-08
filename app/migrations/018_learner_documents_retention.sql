-- 018: Learner documents must be retained for compliance.
-- Learners can no longer delete their documents; uploads replace instead
-- (old row is marked status = 'replaced' and kept, new row becomes active).
--
-- Apply in the Supabase SQL editor (see app/migrations/README convention).

-- 1) Ensure the status column exists ('active' | 'replaced')
ALTER TABLE public.learner_documents
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- 2) Drop the one-document-per-user-per-block unique constraint if it still
--    exists, so replaced rows can coexist with the new active row.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.learner_documents'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.learner_documents DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

-- Also drop any unique index created outside a constraint on (user_id, block_id)
DROP INDEX IF EXISTS learner_documents_user_id_block_id_key;

-- 3) Replace the owner FOR ALL policy (which permitted DELETE) with
--    separate SELECT / INSERT / UPDATE policies — no DELETE for learners.
DROP POLICY IF EXISTS "learner_documents_own" ON public.learner_documents;

CREATE POLICY "learner_documents_own_select"
ON public.learner_documents
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "learner_documents_own_insert"
ON public.learner_documents
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "learner_documents_own_update"
ON public.learner_documents
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 4) Remove any DELETE policies on the learner-documents storage bucket so
--    clients cannot remove the underlying files either.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd = 'DELETE'
      AND (qual ILIKE '%learner-documents%' OR qual ILIKE '%learner_documents%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;
