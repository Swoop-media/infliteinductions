
-- Fix all notification functions with mutable search_path vulnerabilities

-- 1. Fix notify_enrolment_request
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

-- 2. Fix on_enrolment_insert_notify
CREATE OR REPLACE FUNCTION public.on_enrolment_insert_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Insert notification when enrolment is created
  INSERT INTO notifications (
    recipient_id,
    type,
    payload,
    read
  ) VALUES (
    NEW.user_id,
    'enrolment_created',
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
    RAISE WARNING 'Failed to send enrolment insert notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. Fix notify_onsite_training_ready
CREATE OR REPLACE FUNCTION public.notify_onsite_training_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_course_title text;
  v_learner_name text;
BEGIN
  -- Get course and learner details
  SELECT c.title INTO v_course_title
  FROM courses c
  WHERE c.id = NEW.course_id;
  
  SELECT COALESCE(p.full_name, p.first_name || ' ' || p.last_name, p.email, 'User')
  INTO v_learner_name
  FROM profiles p
  WHERE p.id = NEW.user_id;
  
  -- Notify trainers that learner is ready for onsite training
  INSERT INTO notifications (
    recipient_id,
    type,
    payload,
    read
  )
  SELECT 
    ur.user_id,
    'onsite_training_ready',
    jsonb_build_object(
      'course_id', NEW.course_id,
      'assignment_id', NEW.id,
      'learner_id', NEW.user_id,
      'learner_name', v_learner_name,
      'course_title', v_course_title
    ),
    false
  FROM user_roles ur
  WHERE ur.role_name = 'Trainers and Assessors'
    OR ur.role = 'Trainers and Assessors';
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send onsite training ready notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 4. Fix notify_onsite_assessment_ready
CREATE OR REPLACE FUNCTION public.notify_onsite_assessment_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_course_title text;
  v_learner_name text;
BEGIN
  -- Get course and learner details
  SELECT c.title INTO v_course_title
  FROM courses c
  WHERE c.id = NEW.course_id;
  
  SELECT COALESCE(p.full_name, p.first_name || ' ' || p.last_name, p.email, 'User')
  INTO v_learner_name
  FROM profiles p
  WHERE p.id = NEW.user_id;
  
  -- Notify assessors that learner is ready for onsite assessment
  INSERT INTO notifications (
    recipient_id,
    type,
    payload,
    read
  )
  SELECT 
    ur.user_id,
    'onsite_assessment_ready',
    jsonb_build_object(
      'course_id', NEW.course_id,
      'assignment_id', NEW.id,
      'learner_id', NEW.user_id,
      'learner_name', v_learner_name,
      'course_title', v_course_title
    ),
    false
  FROM user_roles ur
  WHERE ur.role_name = 'Trainers and Assessors'
    OR ur.role = 'Trainers and Assessors';
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send onsite assessment ready notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_enrolment_request() IS 'Trigger function to notify on enrolment requests - Fixed search_path vulnerability';
COMMENT ON FUNCTION public.on_enrolment_insert_notify() IS 'Trigger function to notify on enrolment creation - Fixed search_path vulnerability';
COMMENT ON FUNCTION public.notify_onsite_training_ready() IS 'Trigger function to notify trainers when learner ready - Fixed search_path vulnerability';
COMMENT ON FUNCTION public.notify_onsite_assessment_ready() IS 'Trigger function to notify assessors when learner ready - Fixed search_path vulnerability';
