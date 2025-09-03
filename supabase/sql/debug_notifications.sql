
-- Debug script to test notification functions manually

-- First, let's see what the functions would select
SELECT 'ASSIGNMENTS THAT SHOULD GET REMINDERS:' as section;
SELECT DISTINCT 
  ca.id as assignment_id,
  ca.user_id,
  ca.course_id,
  ca.completed_at,
  c.title as course_title,
  c.valid_for_days,
  c.retake_reminder_days,
  (ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) as due_date,
  EXTRACT(days FROM ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE)) as days_until_expiry
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
WHERE ca.assignment_status = 'completed'
AND ca.completed_at IS NOT NULL
AND c.valid_for_days IS NOT NULL
AND c.retake_reminder_days IS NOT NULL
AND c.valid_for_days > 0
AND c.retake_reminder_days > 0
AND EXTRACT(days FROM ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE)) > 0 
AND EXTRACT(days FROM ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE)) <= c.retake_reminder_days;

-- Check if user exists in profiles
SELECT 'USER PROFILE CHECK:' as section;
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.department,
  p.job_description,
  p.microsoft_id
FROM profiles p
WHERE p.id = '6a0bf6d0-6da6-496c-933c-ea0d6fcf0633';

-- Check existing notifications for this user
SELECT 'EXISTING NOTIFICATIONS:' as section;
SELECT 
  id,
  type,
  payload->>'courseTitle' as course_title,
  payload->>'daysUntilExpiry' as days_until_expiry,
  payload->>'event_id' as event_id,
  created_at,
  read
FROM notifications 
WHERE recipient_id = '6a0bf6d0-6da6-496c-933c-ea0d6fcf0633'
AND type = 'course_expiry_reminder'
ORDER BY created_at DESC;

-- Manually insert a test notification to see if it works
DO $$
DECLARE
  v_assignment_id uuid := '7483b76b-61f8-48c2-850b-551e9b598499';
  v_user_id uuid := '6a0bf6d0-6da6-496c-933c-ea0d6fcf0633';
  v_course_title text := 'Sigma 25 jump checks';
  v_days_until_expiry integer := 10;
  v_due_date date := '2025-09-13';
  v_site_url text := 'http://localhost:3000';
  v_learner_name text;
  v_learner_email text;
BEGIN
  -- Get learner details
  SELECT 
    COALESCE(p.full_name, p.email, 'User') as name,
    p.email
  INTO v_learner_name, v_learner_email
  FROM profiles p
  WHERE p.id = v_user_id;
  
  RAISE NOTICE 'Learner found: % (%)', v_learner_name, v_learner_email;

  -- Try to insert notification
  BEGIN
    INSERT INTO notifications (
      recipient_id,
      type,
      payload,
      read
    ) VALUES (
      v_user_id,
      'course_expiry_reminder',
      jsonb_build_object(
        'course_id', (SELECT course_id FROM course_assignments WHERE id = v_assignment_id),
        'assignment_id', v_assignment_id,
        'courseTitle', v_course_title,
        'course_title', v_course_title,
        'daysUntilExpiry', v_days_until_expiry,
        'dueDate', v_due_date::text,
        'learnerName', v_learner_name,
        'learner_email', v_learner_email,
        'url', v_site_url || '/app/learn/courses/' || (SELECT course_id FROM course_assignments WHERE id = v_assignment_id),
        'event_id', 'test_manual_' || v_assignment_id::text || '_' || v_days_until_expiry::text || '_' || EXTRACT(epoch FROM now())::text
      ),
      false
    );

    RAISE NOTICE 'Test notification inserted successfully';

  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'Notification already exists (unique violation)';
    WHEN OTHERS THEN
      RAISE NOTICE 'Failed to insert notification: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;
END $$;

-- Show the newly created notification
SELECT 'NEWLY CREATED NOTIFICATION:' as section;
SELECT 
  id,
  type,
  payload->>'courseTitle' as course_title,
  payload->>'daysUntilExpiry' as days_until_expiry,
  payload->>'event_id' as event_id,
  created_at,
  read
FROM notifications 
WHERE recipient_id = '6a0bf6d0-6da6-496c-933c-ea0d6fcf0633'
AND type = 'course_expiry_reminder'
ORDER BY created_at DESC
LIMIT 1;
