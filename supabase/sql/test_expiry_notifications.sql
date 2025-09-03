
-- Comprehensive test script for expiry notifications

-- First, let's see what we're working with
SELECT 'EXISTING COURSES:' as section;
SELECT 
  id, 
  title, 
  valid_for_days, 
  retake_reminder_days,
  created_by,
  created_at
FROM courses 
ORDER BY created_at DESC 
LIMIT 5;

SELECT 'EXISTING PROFILES:' as section;
SELECT 
  id, 
  email, 
  full_name,
  created_at
FROM profiles 
ORDER BY created_at DESC 
LIMIT 5;

SELECT 'EXISTING ASSIGNMENTS:' as section;
SELECT 
  ca.id,
  ca.user_id,
  ca.course_id,
  ca.role,
  ca.assignment_status,
  ca.completed_at,
  ca.created_by,
  ca.assigned_by,
  c.title as course_title,
  c.valid_for_days,
  c.retake_reminder_days
FROM course_assignments ca
LEFT JOIN courses c ON ca.course_id = c.id
ORDER BY ca.created_at DESC 
LIMIT 10;

-- Update existing course with expiry settings
UPDATE courses 
SET 
  valid_for_days = 365, 
  retake_reminder_days = 30
WHERE id = (SELECT id FROM courses LIMIT 1);

-- Get admin user for assignments
DO $$
DECLARE
  v_admin_id uuid;
  v_regular_user_id uuid;
  v_course_id uuid;
BEGIN
  -- Get admin user
  SELECT id INTO v_admin_id 
  FROM profiles p
  WHERE public.app_has_role(p.id, 'Admin')
  LIMIT 1;
  
  -- Get a regular user (not admin)
  SELECT id INTO v_regular_user_id
  FROM profiles p
  WHERE NOT public.app_has_role(p.id, 'Admin')
  LIMIT 1;
  
  -- If no regular user, just use any other user
  IF v_regular_user_id IS NULL THEN
    SELECT id INTO v_regular_user_id
    FROM profiles p
    WHERE p.id != COALESCE(v_admin_id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;
  END IF;
  
  -- Get course with expiry settings
  SELECT id INTO v_course_id
  FROM courses
  WHERE valid_for_days IS NOT NULL
  LIMIT 1;
  
  -- Store for use in inserts
  IF v_admin_id IS NOT NULL THEN
    PERFORM set_config('test.admin_id', v_admin_id::text, true);
  ELSE
    -- Fallback to any user
    SELECT id INTO v_admin_id FROM profiles LIMIT 1;
    PERFORM set_config('test.admin_id', v_admin_id::text, true);
  END IF;
  
  IF v_regular_user_id IS NOT NULL THEN
    PERFORM set_config('test.user_id', v_regular_user_id::text, true);
  ELSE
    PERFORM set_config('test.user_id', v_admin_id::text, true);
  END IF;
  
  IF v_course_id IS NOT NULL THEN
    PERFORM set_config('test.course_id', v_course_id::text, true);
  END IF;
  
  RAISE NOTICE 'Using admin: %, user: %, course: %', v_admin_id, v_regular_user_id, v_course_id;
END $$;

-- Create test assignments for different scenarios
-- Scenario 1: Assignment expiring in 25 days (should trigger reminder)
INSERT INTO course_assignments (
  id,
  user_id,
  course_id,
  role,
  assigned_by,
  created_by,
  assignment_status,
  completed_at,
  created_at
) 
VALUES (
  gen_random_uuid(),
  current_setting('test.user_id')::uuid,
  current_setting('test.course_id')::uuid,
  'trainee',
  current_setting('test.admin_id')::uuid,
  current_setting('test.admin_id')::uuid,
  'completed',
  (CURRENT_DATE - INTERVAL '340 days'),  -- Completed 340 days ago, expires in 25 days
  now()
)
ON CONFLICT (user_id, course_id, role) DO UPDATE SET
  assignment_status = 'completed',
  completed_at = (CURRENT_DATE - INTERVAL '340 days');

-- Scenario 2: Assignment expiring in 5 days (should trigger reminder)
INSERT INTO course_assignments (
  id,
  user_id,
  course_id,
  role,
  assigned_by,
  created_by,
  assignment_status,
  completed_at,
  created_at
) 
VALUES (
  gen_random_uuid(),
  (SELECT id FROM profiles WHERE id != current_setting('test.user_id')::uuid LIMIT 1),
  current_setting('test.course_id')::uuid,
  'trainee',
  current_setting('test.admin_id')::uuid,
  current_setting('test.admin_id')::uuid,
  'completed',
  (CURRENT_DATE - INTERVAL '360 days'),  -- Completed 360 days ago, expires in 5 days
  now()
)
ON CONFLICT (user_id, course_id, role) DO UPDATE SET
  assignment_status = 'completed',
  completed_at = (CURRENT_DATE - INTERVAL '360 days');

-- Scenario 3: Assignment that expired 2 days ago (should trigger expired notification)
INSERT INTO course_assignments (
  id,
  user_id,
  course_id,
  role,
  assigned_by,
  created_by,
  assignment_status,
  completed_at,
  created_at
) 
VALUES (
  gen_random_uuid(),
  (SELECT id FROM profiles WHERE id NOT IN (
    current_setting('test.user_id')::uuid,
    (SELECT id FROM profiles WHERE id != current_setting('test.user_id')::uuid LIMIT 1)
  ) LIMIT 1),
  current_setting('test.course_id')::uuid,
  'trainee',
  current_setting('test.admin_id')::uuid,
  current_setting('test.admin_id')::uuid,
  'completed',
  (CURRENT_DATE - INTERVAL '367 days'),  -- Completed 367 days ago, expired 2 days ago
  now()
)
ON CONFLICT (user_id, course_id, role) DO UPDATE SET
  assignment_status = 'completed',
  completed_at = (CURRENT_DATE - INTERVAL '367 days');

-- Show what we created
SELECT 'CREATED TEST ASSIGNMENTS:' as section;
SELECT 
  ca.id,
  ca.user_id,
  ca.course_id,
  ca.completed_at,
  ca.assigned_by,
  ca.created_by,
  c.title as course_title,
  c.valid_for_days,
  c.retake_reminder_days,
  p.full_name as user_name,
  p.email as user_email,
  (ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) as due_date,
  ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE) as days_until_expiry,
  CASE 
    WHEN ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE) > 0 
    AND ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE) <= c.retake_reminder_days 
    THEN 'SHOULD SEND REMINDER'
    WHEN ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE) < 0
    AND ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE) >= -7
    THEN 'SHOULD SEND EXPIRED'
    ELSE 'NO NOTIFICATION'
  END as notification_status
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
JOIN profiles p ON p.id = ca.user_id
WHERE ca.assignment_status = 'completed'
AND c.valid_for_days IS NOT NULL
ORDER BY days_until_expiry;

-- Show existing notifications to check for duplicates
SELECT 'EXISTING NOTIFICATIONS:' as section;
SELECT 
  id,
  recipient_id,
  type,
  payload->>'courseTitle' as course_title,
  payload->>'daysUntilExpiry' as days_until_expiry,
  payload->>'daysOverdue' as days_overdue,
  created_at,
  read
FROM notifications 
WHERE type IN ('course_expiry_reminder', 'course_expired')
ORDER BY created_at DESC
LIMIT 10;
