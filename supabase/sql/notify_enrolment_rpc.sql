
-- Create the notify_enrolment_request RPC function
CREATE OR REPLACE FUNCTION notify_enrolment_request(
  p_user_id UUID,
  p_course_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_learner_email TEXT;
  v_learner_name TEXT;
  v_course_title TEXT;
  v_admin_id UUID;
  v_trainer_id UUID;
  v_site_url TEXT := COALESCE(current_setting('app.site_url', true), 'http://localhost:3000');
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
        'url', v_site_url || '/app/admin?tab=enrolments',
        'event_id', 'enrol_req_' || p_user_id::text || '_' || p_course_id::text
      ),
      false
    );

    -- Call the edge function to send Teams notification
    PERFORM net.http_post(
      url := v_site_url || '/api/notify/teams',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'recipientUserId', v_admin_id,
        'type', 'enrolment_request',
        'title', 'New enrollment request',
        'body', 'A learner has requested enrollment in ' || COALESCE(v_course_title, 'a course'),
        'data', jsonb_build_object(
          'learnerName', v_learner_name,
          'learner_email', v_learner_email,
          'courseTitle', v_course_title,
          'user_id', p_user_id,
          'course_id', p_course_id
        )
      )
    );
  END LOOP;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the enrollment
    RAISE WARNING 'Failed to send enrollment notification: %', SQLERRM;
END;
$$;
