-- 025: Clean up live-DB objects that still reference the dropped
-- quiz_questions.module_id column (dropped in migration 024).
--
-- After 024 was applied, inserting a quiz question fails with:
--   record "new" has no field "module_id"
-- i.e. a trigger function that exists only in the live DB (not in repo SQL —
-- same situation as migrations 012/013) still reads NEW.module_id. The DO
-- block below discovers and drops any such trigger dynamically, so we don't
-- need to know its name in advance. It prints a NOTICE for everything it
-- drops and is a safe no-op if nothing matches.
--
-- The ensure_quiz_for_module() RPC (called from learner quiz pages) also
-- still ran `UPDATE quiz_questions ... WHERE module_id = ...`; it is
-- recreated below without that dead statement.

-- ---------------------------------------------------------------------------
-- 1) Drop triggers whose functions still reference quiz_questions.module_id
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  trg record;
BEGIN
  FOR trg IN
    SELECT t.tgname, c.relname, p.proname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND (
        -- any trigger directly on quiz_questions whose function mentions module_id
        (c.relname = 'quiz_questions' AND p.prosrc ~* 'module_id')
        -- or any trigger elsewhere whose function touches quiz_questions via module_id
        OR (p.prosrc ~* 'quiz_questions' AND p.prosrc ~* 'module_id')
      )
  LOOP
    RAISE NOTICE 'Dropping trigger % on % (function %)', trg.tgname, trg.relname, trg.proname;
    EXECUTE format('DROP TRIGGER %I ON public.%I', trg.tgname, trg.relname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Recreate ensure_quiz_for_module() without the quiz_questions UPDATE
--    (questions are always quiz_id-linked now; there is nothing to relink)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ensure_quiz_for_module(p_module_id UUID)
RETURNS TABLE(id UUID, pass_mark INTEGER, max_attempts INTEGER, shuffle BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz_record RECORD;
  v_module_record RECORD;
BEGIN
  SELECT course_id, type INTO v_module_record
  FROM course_modules
  WHERE course_modules.id = p_module_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Module not found: %', p_module_id;
  END IF;

  IF v_module_record.type != 'digital_assessment_quiz' THEN
    RAISE EXCEPTION 'Module is not a quiz type: %', v_module_record.type;
  END IF;

  -- Existing module-scoped quiz
  SELECT q.id, q.pass_mark, q.max_attempts, q.shuffle INTO v_quiz_record
  FROM quizzes q
  WHERE q.module_id = p_module_id;

  IF FOUND THEN
    RETURN QUERY SELECT v_quiz_record.id, v_quiz_record.pass_mark, v_quiz_record.max_attempts, v_quiz_record.shuffle;
    RETURN;
  END IF;

  -- Legacy course-level quiz: adopt it for this module
  SELECT q.id, q.pass_mark, q.max_attempts, q.shuffle INTO v_quiz_record
  FROM quizzes q
  WHERE q.course_id = v_module_record.course_id
    AND q.module_id IS NULL;

  IF FOUND THEN
    UPDATE quizzes
    SET module_id = p_module_id
    WHERE quizzes.id = v_quiz_record.id;

    RETURN QUERY SELECT v_quiz_record.id, v_quiz_record.pass_mark, v_quiz_record.max_attempts, v_quiz_record.shuffle;
    RETURN;
  END IF;

  -- Create a new quiz for this module
  INSERT INTO quizzes (module_id, course_id, pass_mark, max_attempts, shuffle)
  VALUES (p_module_id, v_module_record.course_id, 70, 3, false)
  RETURNING quizzes.id, quizzes.pass_mark, quizzes.max_attempts, quizzes.shuffle
  INTO v_quiz_record;

  RETURN QUERY SELECT v_quiz_record.id, v_quiz_record.pass_mark, v_quiz_record.max_attempts, v_quiz_record.shuffle;
END;
$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
