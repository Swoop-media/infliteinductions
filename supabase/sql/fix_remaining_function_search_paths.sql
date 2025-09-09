
-- Fix remaining functions with mutable search_path vulnerabilities

-- 1. Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Drop notify_enrolment_request function (it's deprecated and no longer used)
-- First drop any triggers that might reference it
DROP TRIGGER IF EXISTS enrolment_request_notification_trigger ON public.enrolments;
DROP TRIGGER IF EXISTS notify_enrolment_request_trigger ON public.enrolments;

-- Complete removal of notify_enrolment_request function (no longer used with assignment system)
-- Drop all triggers that might reference the function
DROP TRIGGER IF EXISTS enrolment_insert_notify ON public.course_enrolments;
DROP TRIGGER IF EXISTS enrolment_insert_notify_alt ON public.enrolments;
DROP TRIGGER IF EXISTS notify_enrolment_trigger ON public.enrolments;
DROP TRIGGER IF EXISTS enrolment_notify_trigger ON public.enrolments;
DROP TRIGGER IF EXISTS enrolment_request_notification_trigger ON public.enrolments;
DROP TRIGGER IF EXISTS notify_enrolment_request_trigger ON public.enrolments;

-- Drop the trigger function
DROP FUNCTION IF EXISTS public.on_enrolment_insert_notify();

-- Fix on_enrolment_insert_notify function by adding fixed search_path
CREATE OR REPLACE FUNCTION public.on_enrolment_insert_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Only notify for pending enrolments (new requests)
  IF NEW.status = 'pending' THEN
    RAISE LOG 'Enrollment trigger fired: user_id=%, course_id=%, status=%',
      NEW.user_id, NEW.course_id, NEW.status;

    -- Call the notification function
    PERFORM notify_enrolment_request(NEW.user_id, NEW.course_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Fix notify_enrolment_request RPC function by adding fixed search_path
CREATE OR REPLACE FUNCTION public.notify_enrolment_request(
  p_user_id UUID,
  p_course_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_learner_email TEXT;
  v_learner_name TEXT;
  v_course_title TEXT;
  v_admin_id UUID;
  v_site_url TEXT := COALESCE(current_setting('app.site_url', true), 'http://localhost:3000');
  v_response_status INTEGER;
  v_response_body TEXT;
BEGIN
  -- Get learner info
  SELECT email,
         COALESCE(user_metadata->>'full_name', email) as name
  INTO v_learner_email, v_learner_name
  FROM auth.users
  WHERE id = p_user_id;

  -- Get course title
  SELECT title INTO v_course_title
  FROM courses
  WHERE id = p_course_id;

  -- Notify all admins and trainers
  FOR v_admin_id IN
    SELECT DISTINCT ur.user_id
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE LOWER(r.name) IN ('admin', 'trainers and assessors')
  LOOP
    -- Insert notification
    BEGIN
      INSERT INTO notifications (
        recipient_id,
        type,
        payload,
        read
      ) VALUES (
        v_admin_id,
        'enrolment_request',
        jsonb_build_object(
          'user_id', p_user_id,
          'course_id', p_course_id,
          'learnerName', v_learner_name,
          'learner_email', v_learner_email,
          'courseTitle', v_course_title,
          'course_title', v_course_title,
          'url', v_site_url || '/app/admin?tab=enrolments',
          'event_id', 'enrol_req_' || p_user_id::text || '_' || p_course_id::text
        ),
        false
      );
      
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to insert notification for admin %: %', v_admin_id, SQLERRM;
    END;
  END LOOP;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send enrollment notification: %', SQLERRM;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION public.update_updated_at_column() IS 'Trigger function to update updated_at column - Fixed search_path vulnerability';
