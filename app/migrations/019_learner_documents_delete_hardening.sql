-- 019: Hardening follow-up to 018 (learner document retention).
--
-- Verified on the live DB after 018 was applied: a learner session could
-- STILL delete their own learner_documents rows and learner-documents
-- storage files. 018 only dropped policies it knew by name/qual, and a
-- surviving permissive DELETE policy (e.g. a generically-named one, or one
-- whose qual doesn't mention the bucket) kept DELETE open.
--
-- Fix: add RESTRICTIVE policies. A restrictive policy must pass IN ADDITION
-- to any permissive policy, so it blocks DELETE no matter what permissive
-- policies exist now or are added later. The service-role key bypasses RLS,
-- so server-side admin operations are unaffected.
--
-- Apply in the Supabase SQL editor (see app/migrations/README convention).

-- 1) Block learner (any authenticated client) DELETE on learner_documents rows.
DROP POLICY IF EXISTS "learner_documents_no_delete" ON public.learner_documents;
CREATE POLICY "learner_documents_no_delete"
ON public.learner_documents
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);

-- 2) Block client-side deletion of files in the learner-documents bucket.
--    (Other buckets are unaffected: the policy only fails when the object
--    is in learner-documents.)
DROP POLICY IF EXISTS "learner_documents_bucket_no_delete" ON storage.objects;
CREATE POLICY "learner_documents_bucket_no_delete"
ON storage.objects
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (bucket_id <> 'learner-documents');
