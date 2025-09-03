
-- Test script to create sample data for expiry notifications

-- First, let's check what courses exist and update one with expiry settings
UPDATE courses 
SET valid_for_days = 365, 
    retake_reminder_days = 30
WHERE id = (SELECT id FROM courses LIMIT 1);

-- Create a test assignment that will expire soon (completed 340 days ago, so expires in 25 days)
-- This should trigger a reminder since it's within the 30-day reminder window

-- First, let's ensure we have an admin user to assign from
DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Get the first admin user
  SELECT id INTO v_admin_id 
  FROM profiles p
  WHERE EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = p.id 
    AND ur.role = 'Admin'
  )
  LIMIT 1;
  
  -- If no admin, get any user with course creation rights
  IF v_admin_id IS NULL THEN
    SELECT created_by INTO v_admin_id
    FROM courses
    WHERE created_by IS NOT NULL
    LIMIT 1;
  END IF;
  
  -- Store in a temporary setting for the insert
  IF v_admin_id IS NOT NULL THEN
    PERFORM set_config('test.admin_id', v_admin_id::text, true);
  ELSE
    RAISE EXCEPTION 'No valid admin user found for test data';
  END IF;
END $$;

INSERT INTO course_assignments (
  id,
  user_id,
  course_id,
  role,
  assigned_by,
  assignment_status,
  completed_at,
  created_at
) 
SELECT 
  gen_random_uuid(),
  p.id as user_id,
  c.id as course_id,
  'trainee' as role,
  COALESCE(c.created_by, current_setting('test.admin_id')::uuid) as assigned_by,
  'completed',
  (CURRENT_DATE - INTERVAL '340 days') as completed_at,
  now()
FROM profiles p 
CROSS JOIN courses c 
WHERE c.valid_for_days IS NOT NULL
AND c.created_by IS NOT NULL  -- Ensure course has a creator
AND p.id != c.created_by  -- Don't assign course to its creator
LIMIT 1
ON CONFLICT (user_id, course_id, role) DO NOTHING;

-- Check what we created
SELECT 
  ca.id,
  ca.user_id,
  ca.course_id,
  ca.completed_at,
  c.title as course_title,
  c.valid_for_days,
  c.retake_reminder_days,
  (ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) as due_date,
  ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE) as days_until_expiry
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
WHERE ca.assignment_status = 'completed'
AND c.valid_for_days IS NOT NULL;
