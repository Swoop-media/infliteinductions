-- Migration 009: Quiz review by onsite trainer/assessor
-- 1) Adds quizzes.reviewable_onsite so creators can mark a quiz as reviewable
--    by onsite trainers/assessors.
-- 2) Adds quiz_onsite_reviews to store reviewer comments on a learner's quiz.
--
-- Apply manually in the Supabase SQL editor (same as previous migrations).
-- Safe to run multiple times.

-- 1) Creator toggle on quizzes
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS reviewable_onsite boolean NOT NULL DEFAULT false;

-- 2) Reviewer comments
CREATE TABLE IF NOT EXISTS public.quiz_onsite_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.quiz_attempts(id) ON DELETE SET NULL,
  learner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comments text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, learner_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_onsite_reviews_quiz_learner
  ON public.quiz_onsite_reviews (quiz_id, learner_id);

-- RLS: all reads/writes go through the app's service-role client with
-- server-side role checks, so lock the table down for other roles.
ALTER TABLE public.quiz_onsite_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quiz_onsite_reviews'
      AND policyname = 'quiz_onsite_reviews_no_direct_access'
  ) THEN
    CREATE POLICY quiz_onsite_reviews_no_direct_access
      ON public.quiz_onsite_reviews
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
