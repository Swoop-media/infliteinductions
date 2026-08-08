-- 016: Delete orphaned quiz_questions left over from the old data model.
--
-- Problem: quiz_questions rows with quiz_id IS NULL (linked only by module_id)
-- linger after questions were deleted/re-created under the new quiz_id model.
-- Any surface that queries by module_id can wrongly show them (e.g. the
-- Dangerous Goods quiz review displayed 17 questions when the quiz has 2).
--
-- Rule: delete a module-linked orphan ONLY when that module's quiz already has
-- its own quiz_id-linked questions. Legacy modules whose quizzes rely purely on
-- module-linked questions are left untouched, so no learner-facing quiz loses
-- its questions (the learner fallback only uses module-linked questions when a
-- quiz has none by quiz_id).
--
-- Safe to run in the Supabase SQL editor. Idempotent: re-running deletes nothing.

BEGIN;

-- Orphaned questions in modules whose quiz already has quiz_id-linked questions.
CREATE TEMP TABLE _orphaned_question_ids ON COMMIT DROP AS
SELECT qq.id
FROM quiz_questions qq
WHERE qq.quiz_id IS NULL
  AND qq.module_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM quizzes qz
    JOIN quiz_questions qq2 ON qq2.quiz_id = qz.id
    WHERE qz.module_id = qq.module_id
  );

-- Report what will be removed (visible in SQL editor output).
SELECT count(*) AS orphaned_questions_to_delete FROM _orphaned_question_ids;

-- Delete their options first (in case there is no ON DELETE CASCADE).
DELETE FROM quiz_options qo
USING _orphaned_question_ids o
WHERE qo.question_id = o.id;

DELETE FROM quiz_questions qq
USING _orphaned_question_ids o
WHERE qq.id = o.id;

COMMIT;

-- Verification (optional): remaining module-linked orphans should belong only
-- to legacy modules whose quiz has no quiz_id-linked questions.
-- SELECT module_id, count(*)
-- FROM quiz_questions
-- WHERE quiz_id IS NULL AND module_id IS NOT NULL
-- GROUP BY module_id;
