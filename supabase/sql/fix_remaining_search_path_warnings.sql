-- Final cleanup for remaining search_path vulnerabilities
-- This ensures any old function definitions are properly replaced

-- 1. Drop unused notify_enrolment_request function (no longer needed with direct assignments)
DROP FUNCTION IF EXISTS public.notify_enrolment_request();

-- 2. Fix ensure_quiz_for_module (drop and recreate to fix return type conflict)
-- First drop the existing function to avoid return type conflicts
DROP FUNCTION IF EXISTS public.ensure_quiz_for_module(uuid);

-- This function returns quiz info, matching the existing RPC function signature
CREATE OR REPLACE FUNCTION public.ensure_quiz_for_module(p_module_id uuid)
RETURNS TABLE(
  id uuid,
  pass_mark integer,
  max_attempts integer,
  shuffle boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_quiz_record RECORD;
  v_module_record RECORD;
BEGIN
  -- Get module information
  SELECT course_id, type INTO v_module_record 
  FROM course_modules 
  WHERE course_modules.id = p_module_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Module not found: %', p_module_id;
  END IF;

  IF v_module_record.type != 'digital_assessment_quiz' THEN
    RAISE EXCEPTION 'Module is not a quiz type: %', v_module_record.type;
  END IF;

  -- Check if quiz already exists for this module
  SELECT q.id, q.pass_mark, q.max_attempts, q.shuffle INTO v_quiz_record
  FROM quizzes q
  WHERE q.module_id = p_module_id;

  IF FOUND THEN
    -- Return existing quiz
    RETURN QUERY SELECT v_quiz_record.id, v_quiz_record.pass_mark, v_quiz_record.max_attempts, v_quiz_record.shuffle;
    RETURN;
  END IF;

  -- Check if there's a legacy course-level quiz
  SELECT q.id, q.pass_mark, q.max_attempts, q.shuffle INTO v_quiz_record
  FROM quizzes q
  WHERE q.course_id = v_module_record.course_id
  AND q.module_id IS NULL;

  IF FOUND THEN
    -- Update legacy quiz to be associated with this module
    UPDATE quizzes 
    SET module_id = p_module_id 
    WHERE quizzes.id = v_quiz_record.id;

    RETURN QUERY SELECT v_quiz_record.id, v_quiz_record.pass_mark, v_quiz_record.max_attempts, v_quiz_record.shuffle;
    RETURN;
  END IF;

  -- Create new quiz for this module and return it directly
  INSERT INTO quizzes (module_id, course_id, pass_mark, max_attempts, shuffle)
  VALUES (p_module_id, v_module_record.course_id, 70, 3, false)
  RETURNING quizzes.id, quizzes.pass_mark, quizzes.max_attempts, quizzes.shuffle
  INTO v_quiz_record;

  -- Link any existing questions for this module to the new quiz
  UPDATE quiz_questions 
  SET quiz_id = v_quiz_record.id 
  WHERE module_id = p_module_id 
  AND quiz_id IS NULL;

  -- Return the quiz record
  RETURN QUERY SELECT v_quiz_record.id, v_quiz_record.pass_mark, v_quiz_record.max_attempts, v_quiz_record.shuffle;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to ensure quiz for module %: %', p_module_id, SQLERRM;
    -- Return empty result on error
    RETURN;
END;
$$;

-- Add helpful comments
COMMENT ON FUNCTION public.ensure_quiz_for_module(uuid) IS 'RPC function to ensure quiz exists for module - Fixed search_path vulnerability';

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.ensure_quiz_for_module(uuid) TO authenticated;