
-- Drop existing function if it exists to avoid return type conflicts
DROP FUNCTION IF EXISTS ensure_quiz_for_module(UUID);

-- Function to ensure a quiz exists for a module
CREATE OR REPLACE FUNCTION ensure_quiz_for_module(p_module_id UUID)
RETURNS TABLE(id UUID, pass_mark INTEGER, max_attempts INTEGER, shuffle BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quiz_record RECORD;
  v_module_record RECORD;
BEGIN
  -- Get module information
  SELECT course_id, type INTO v_module_record 
  FROM course_modules 
  WHERE id = p_module_id;
  
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
    WHERE id = v_quiz_record.id;
    
    RETURN QUERY SELECT v_quiz_record.id, v_quiz_record.pass_mark, v_quiz_record.max_attempts, v_quiz_record.shuffle;
    RETURN;
  END IF;
  
  -- Create new quiz for this module
  INSERT INTO quizzes (module_id, course_id, pass_mark, max_attempts, shuffle)
  VALUES (p_module_id, v_module_record.course_id, 70, 3, false)
  RETURNING quizzes.id, quizzes.pass_mark, quizzes.max_attempts, quizzes.shuffle INTO v_quiz_record;
  
  RETURN QUERY SELECT v_quiz_record.id, v_quiz_record.pass_mark, v_quiz_record.max_attempts, v_quiz_record.shuffle;
END;
$$;
