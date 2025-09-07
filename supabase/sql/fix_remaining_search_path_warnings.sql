
-- Final cleanup for remaining search_path vulnerabilities
-- This ensures any old function definitions are properly replaced

-- 1. Fix notify_enrolment_request (already in fix_notification_functions_search_path.sql but ensuring it's applied)
CREATE OR REPLACE FUNCTION public.notify_enrolment_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Insert notification for enrolment request
  INSERT INTO notifications (
    recipient_id,
    type,
    payload,
    read
  ) VALUES (
    NEW.user_id,
    'enrolment_request',
    jsonb_build_object(
      'course_id', NEW.course_id,
      'enrolment_id', NEW.id,
      'status', NEW.status
    ),
    false
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the main operation
    RAISE WARNING 'Failed to send enrolment notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 2. Fix ensure_quiz_for_module (already in ensure_quiz_for_module_rpc.sql but ensuring it's applied)
-- This function returns a table, not void
CREATE OR REPLACE FUNCTION public.ensure_quiz_for_module(module_id_param uuid)
RETURNS TABLE(
  id uuid,
  stem text,
  type text,
  points integer,
  order_index integer,
  options jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_quiz_count integer;
  v_question_id uuid;
BEGIN
  -- Check if module already has quiz questions
  SELECT COUNT(*) INTO v_quiz_count
  FROM quiz_questions
  WHERE module_id = module_id_param;
  
  -- If no quiz questions exist, create default ones
  IF v_quiz_count = 0 THEN
    -- Create first question
    INSERT INTO quiz_questions (module_id, stem, type, points, order_index)
    VALUES (module_id_param, 'Default quiz question 1', 'mcq', 1, 0)
    RETURNING quiz_questions.id INTO v_question_id;
    
    -- Add options for first question
    INSERT INTO quiz_options (question_id, label, is_correct)
    VALUES 
      (v_question_id, 'Option A', true),
      (v_question_id, 'Option B', false),
      (v_question_id, 'Option C', false),
      (v_question_id, 'Option D', false);
    
    -- Create second question
    INSERT INTO quiz_questions (module_id, stem, type, points, order_index)
    VALUES (module_id_param, 'Default quiz question 2', 'mcq', 1, 1)
    RETURNING quiz_questions.id INTO v_question_id;
    
    -- Add options for second question
    INSERT INTO quiz_options (question_id, label, is_correct)
    VALUES 
      (v_question_id, 'Option A', true),
      (v_question_id, 'Option B', false),
      (v_question_id, 'Option C', false),
      (v_question_id, 'Option D', false);
  END IF;
  
  -- Return all questions for this module with their options
  RETURN QUERY
  SELECT 
    q.id,
    q.stem,
    q.type,
    q.points,
    q.order_index,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'label', o.label,
          'is_correct', o.is_correct
        ) ORDER BY o.label
      ) FILTER (WHERE o.id IS NOT NULL),
      '[]'::jsonb
    ) as options
  FROM quiz_questions q
  LEFT JOIN quiz_options o ON o.question_id = q.id
  WHERE q.module_id = module_id_param
  GROUP BY q.id, q.stem, q.type, q.points, q.order_index
  ORDER BY q.order_index;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to ensure quiz for module %: %', module_id_param, SQLERRM;
    -- Return empty result on error
    RETURN;
END;
$$;

-- Add helpful comments
COMMENT ON FUNCTION public.notify_enrolment_request() IS 'Trigger function to notify on enrolment requests - Fixed search_path vulnerability';
COMMENT ON FUNCTION public.ensure_quiz_for_module(uuid) IS 'RPC function to ensure quiz exists for module - Fixed search_path vulnerability';

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.ensure_quiz_for_module(uuid) TO authenticated;
