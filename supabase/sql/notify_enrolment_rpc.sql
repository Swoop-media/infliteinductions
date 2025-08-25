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

  -- Log what we're doing
  RAISE LOG 'Notifying enrollment request: user_id=%, course_id=%, learner=%, course=%',
    p_user_id, p_course_id, v_learner_name, v_course_title;

  -- Notify all admins and trainers
  FOR v_admin_id IN
    SELECT DISTINCT ur.user_id
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE LOWER(r.name) IN ('admin', 'trainers and assessors')
  LOOP
    -- Insert notification using the original schema (recipient_id and payload)
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

    -- Call the edge function to send Teams notification with better error handling
    BEGIN
      SELECT status, content INTO v_response_status, v_response_body
      FROM net.http_post(
        url := v_site_url || '/api/notify/teams',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'User-Agent', 'Supabase-Edge-Function'
        ),
        body := jsonb_build_object(
          'recipientUserId', v_admin_id,
          'type', 'enrolment_request',
          'title', 'New enrollment request',
          'body', v_learner_name || ' has requested enrollment in ' || COALESCE(v_course_title, 'a course'),
          'data', jsonb_build_object(
            'learnerName', v_learner_name,
            'learner_email', v_learner_email,
            'courseTitle', v_course_title,
            'course_title', v_course_title,
            'user_id', p_user_id,
            'course_id', p_course_id
          )
        )
      );

      -- Log the response
      RAISE LOG 'Teams notification API response: status=%, body=%', v_response_status, v_response_body;

      IF v_response_status < 200 OR v_response_status >= 300 THEN
        RAISE WARNING 'Teams notification API returned status %: %', v_response_status, v_response_body;
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to call Teams notification API for admin %: %', v_admin_id, SQLERRM;
    END;
  END LOOP;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the enrollment
    RAISE WARNING 'Failed to send enrollment notification: %', SQLERRM;
END;
$$;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION on_enrolment_insert_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Drop and recreate the trigger to ensure it's working
DROP TRIGGER IF EXISTS enrolment_insert_notify ON course_enrolments;

CREATE TRIGGER enrolment_insert_notify
  AFTER INSERT ON course_enrolments
  FOR EACH ROW
  EXECUTE FUNCTION on_enrolment_insert_notify();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION notify_enrolment_request(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION on_enrolment_insert_notify() TO service_role;