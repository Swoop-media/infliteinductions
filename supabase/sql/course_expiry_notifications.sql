-- Function to send course expiry reminder notifications
-- This should be called daily (via cron job or scheduled function)

CREATE OR REPLACE FUNCTION public.send_course_expiry_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_site_url text;
  v_assignment record;
  v_course_title text;
  v_learner_name text;
  v_learner_email text;
  v_days_until_expiry integer;
  v_due_date date;
BEGIN
  -- Get site URL from environment or use default
  v_site_url := COALESCE(current_setting('app.site_url', true), 'http://localhost:3000');

  RAISE LOG 'Starting course expiry reminder check...';

  -- Find all assignments that need reminders
  FOR v_assignment IN
    SELECT DISTINCT 
      ca.id as assignment_id,
      ca.user_id,
      ca.course_id,
      ca.completed_at,
      c.title as course_title,
      c.valid_for_days,
      c.retake_reminder_days
    FROM course_assignments ca
    JOIN courses c ON ca.course_id = c.id
    WHERE ca.assignment_status = 'completed'
    AND ca.completed_at IS NOT NULL
    AND c.valid_for_days IS NOT NULL
    AND c.retake_reminder_days IS NOT NULL
    AND c.valid_for_days > 0
    AND c.retake_reminder_days > 0
  LOOP
    -- Calculate due date and days until expiry
    v_due_date := (v_assignment.completed_at::date + INTERVAL '1 day' * v_assignment.valid_for_days);
    v_days_until_expiry := (v_due_date - CURRENT_DATE);

    -- Only send notifications if within the reminder window and not yet expired
    IF v_days_until_expiry > 0 AND v_days_until_expiry <= v_assignment.retake_reminder_days THEN

      -- Get learner details
      BEGIN
        SELECT 
          COALESCE(p.full_name, p.first_name || ' ' || p.last_name, p.email, 'User') as name,
          p.email
        INTO v_learner_name, v_learner_email
        FROM profiles p
        WHERE p.id = v_assignment.user_id;
      EXCEPTION
        WHEN OTHERS THEN
          v_learner_name := 'User';
          v_learner_email := '';
      END;

      v_course_title := v_assignment.course_title;

      RAISE LOG 'Sending expiry reminder: user=%, course=%, days_left=%', 
        v_learner_name, v_course_title, v_days_until_expiry;

      -- Insert notification
      BEGIN
        INSERT INTO notifications (
          recipient_id,
          type,
          payload,
          read
        ) VALUES (
          v_assignment.user_id,
          'course_expiry_reminder',
          jsonb_build_object(
            'course_id', v_assignment.course_id,
            'assignment_id', v_assignment.assignment_id,
            'courseTitle', v_course_title,
            'course_title', v_course_title,
            'daysUntilExpiry', v_days_until_expiry,
            'dueDate', v_due_date::text,
            'learnerName', v_learner_name,
            'learner_email', v_learner_email,
            'url', v_site_url || '/app/learn/courses/' || v_assignment.course_id,
            'event_id', 'course_expiry_' || v_assignment.assignment_id::text || '_' || v_days_until_expiry::text
          ),
          false
        );

        RAISE LOG 'Expiry reminder notification sent to: %', v_learner_name;

      EXCEPTION
        WHEN unique_violation THEN
          -- Notification already sent for this day, skip
          RAISE LOG 'Expiry reminder already sent for user % course % (%d days)', 
            v_learner_name, v_course_title, v_days_until_expiry;
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to send expiry reminder to %: % (SQLSTATE: %)', 
            v_learner_name, SQLERRM, SQLSTATE;
      END;

    END IF;
  END LOOP;

  RAISE LOG 'Course expiry reminder check completed';

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send course expiry reminders: %', SQLERRM;
END;
$$;

-- Function to send expired course notifications (for courses that have already expired)
CREATE OR REPLACE FUNCTION send_expired_course_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site_url text;
  v_assignment record;
  v_course_title text;
  v_learner_name text;
  v_learner_email text;
  v_days_overdue integer;
  v_due_date date;
BEGIN
  -- Get site URL from environment or use default
  v_site_url := COALESCE(current_setting('app.site_url', true), 'http://localhost:3000');

  RAISE LOG 'Starting expired course notification check...';

  -- Find all assignments that have expired
  FOR v_assignment IN
    SELECT DISTINCT 
      ca.id as assignment_id,
      ca.user_id,
      ca.course_id,
      ca.completed_at,
      c.title as course_title,
      c.valid_for_days
    FROM course_assignments ca
    JOIN courses c ON ca.course_id = c.id
    WHERE ca.assignment_status = 'completed'
    AND ca.completed_at IS NOT NULL
    AND c.valid_for_days IS NOT NULL
    AND c.valid_for_days > 0
  LOOP
    -- Calculate due date and days overdue
    v_due_date := (v_assignment.completed_at::date + INTERVAL '1 day' * v_assignment.valid_for_days);
    v_days_overdue := (CURRENT_DATE - v_due_date);

    -- Only send notifications for recently expired courses (within 7 days)
    IF v_days_overdue > 0 AND v_days_overdue <= 7 THEN

      -- Get learner details
      BEGIN
        SELECT 
          COALESCE(p.full_name, p.first_name || ' ' || p.last_name, p.email, 'User') as name,
          p.email
        INTO v_learner_name, v_learner_email
        FROM profiles p
        WHERE p.id = v_assignment.user_id;
      EXCEPTION
        WHEN OTHERS THEN
          v_learner_name := 'User';
          v_learner_email := '';
      END;

      v_course_title := v_assignment.course_title;

      RAISE LOG 'Sending expired notification: user=%, course=%, days_overdue=%', 
        v_learner_name, v_course_title, v_days_overdue;

      -- Insert notification
      BEGIN
        INSERT INTO notifications (
          recipient_id,
          type,
          payload,
          read
        ) VALUES (
          v_assignment.user_id,
          'course_expired',
          jsonb_build_object(
            'course_id', v_assignment.course_id,
            'assignment_id', v_assignment.assignment_id,
            'courseTitle', v_course_title,
            'course_title', v_course_title,
            'daysOverdue', v_days_overdue,
            'dueDate', v_due_date::text,
            'learnerName', v_learner_name,
            'learner_email', v_learner_email,
            'url', v_site_url || '/app/learn/courses/' || v_assignment.course_id,
            'event_id', 'course_expired_' || v_assignment.assignment_id::text || '_' || v_days_overdue::text
          ),
          false
        );

        RAISE LOG 'Expired course notification sent to: %', v_learner_name;

      EXCEPTION
        WHEN unique_violation THEN
          -- Notification already sent for this day, skip
          RAISE LOG 'Expired notification already sent for user % course % (%d days overdue)', 
            v_learner_name, v_course_title, v_days_overdue;
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to send expired notification to %: % (SQLSTATE: %)', 
            v_learner_name, SQLERRM, SQLSTATE;
      END;

    END IF;
  END LOOP;

  RAISE LOG 'Expired course notification check completed';

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send expired course notifications: %', SQLERRM;
END;
$$;

-- Comment explaining usage
COMMENT ON FUNCTION send_course_expiry_reminders() IS 'Send daily reminder notifications to users whose course certifications are approaching expiry';
COMMENT ON FUNCTION send_expired_course_notifications() IS 'Send notifications to users whose course certifications have recently expired';