-- 017: Backfill quiz_id on legacy module-linked quiz questions.
--
-- Migration 016 deleted module-linked orphans only where the module's quiz
-- already had quiz_id-linked questions, deliberately leaving four legacy
-- modules untouched (Rotorcraft Flight Manual AS 355 F1, INFLITE Helicopter
-- Operations Quiz, 135 ESAP quiz, and one "Digital Quiz") so learners kept
-- their questions. Those quizzes still rely on the module_id fallback in the
-- learner flow.
--
-- Rule: set quiz_id on module-linked questions ONLY when the module has
-- exactly one quiz and that quiz has zero quiz_id-linked questions. This
-- exactly matches the population migration 016 skipped, so no question can be
-- attached to the wrong quiz and quizzes that already have quiz_id-linked
-- questions are never touched.
--
-- After this runs, no quiz_questions rows should remain with quiz_id IS NULL
-- and module_id IS NOT NULL, and the module_id fallbacks in the learner quiz
-- flow become dead code for these quizzes (retirable later).
--
-- Safe to run in the Supabase SQL editor. Idempotent: re-running updates nothing.

BEGIN;

WITH sole_quiz AS (
  -- Modules that have exactly one quiz.
  SELECT qz.module_id, min(qz.id::text)::uuid AS quiz_id
  FROM quizzes qz
  WHERE qz.module_id IS NOT NULL
  GROUP BY qz.module_id
  HAVING count(*) = 1
),
eligible AS (
  -- ...whose sole quiz has no quiz_id-linked questions yet.
  SELECT sq.module_id, sq.quiz_id
  FROM sole_quiz sq
  WHERE NOT EXISTS (
    SELECT 1 FROM quiz_questions qq2 WHERE qq2.quiz_id = sq.quiz_id
  )
)
UPDATE quiz_questions qq
SET quiz_id = e.quiz_id
FROM eligible e
WHERE qq.module_id = e.module_id
  AND qq.quiz_id IS NULL;

COMMIT;

-- Verification (optional): should return zero rows once applied.
-- SELECT module_id, count(*)
-- FROM quiz_questions
-- WHERE quiz_id IS NULL AND module_id IS NOT NULL
-- GROUP BY module_id;
