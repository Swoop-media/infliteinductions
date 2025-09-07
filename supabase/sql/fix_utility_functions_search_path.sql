
-- Fix utility functions with mutable search_path vulnerabilities

-- 1. Fix check_authorization_completion
CREATE OR REPLACE FUNCTION public.check_authorization_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_total_courses integer;
  v_completed_courses integer;
  v_completion_percentage numeric;
BEGIN
  -- Count total and completed courses for this authorization
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN ca.assignment_status = 'completed' THEN 1 END) as completed
  INTO v_total_courses, v_completed_courses
  FROM course_assignments ca
  JOIN authorization_courses ac ON ac.course_id = ca.course_id
  WHERE ca.user_id = NEW.user_id
    AND ac.authorization_id = (
      SELECT authorization_id 
      FROM authorization_courses 
      WHERE course_id = NEW.course_id 
      LIMIT 1
    );
  
  -- Calculate completion percentage
  IF v_total_courses > 0 THEN
    v_completion_percentage := (v_completed_courses::numeric / v_total_courses) * 100;
    
    -- Update authorization completion status
    UPDATE authorizations 
    SET 
      completion_percentage = v_completion_percentage,
      status = CASE 
        WHEN v_completion_percentage = 100 THEN 'completed'
        WHEN v_completion_percentage > 0 THEN 'in_progress'
        ELSE 'pending'
      END,
      completed_at = CASE 
        WHEN v_completion_percentage = 100 THEN now()
        ELSE completed_at
      END
    WHERE id = (
      SELECT authorization_id 
      FROM authorization_courses 
      WHERE course_id = NEW.course_id 
      LIMIT 1
    );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to check authorization completion: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 2. Fix link_admin_created_user
CREATE OR REPLACE FUNCTION public.link_admin_created_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Link admin-created user profiles to auth.users
  IF NEW.admin_created = true AND NEW.email IS NOT NULL THEN
    -- Update the profile when corresponding auth user is created
    UPDATE profiles 
    SET 
      auth_user_id = NEW.id,
      email_confirmed = true,
      updated_at = now()
    WHERE email = NEW.email 
      AND auth_user_id IS NULL;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to link admin created user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. ensure_quiz_for_module is already properly fixed in ensure_quiz_for_module_rpc.sql
-- with correct return type and search_path security

-- 4. Fix send_expired_course_notifications (already fixed in course_expiry_notifications.sql)
CREATE OR REPLACE FUNCTION public.send_expired_course_notifications()
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

COMMENT ON FUNCTION public.check_authorization_completion() IS 'Trigger function to check authorization completion - Fixed search_path vulnerability';
COMMENT ON FUNCTION public.link_admin_created_user() IS 'Trigger function to link admin-created users - Fixed search_path vulnerability';
-- ensure_quiz_for_module is handled in ensure_quiz_for_module_rpc.sql with proper return type
COMMENT ON FUNCTION public.send_expired_course_notifications() IS 'Function to send expired course notifications - Fixed search_path vulnerability';
