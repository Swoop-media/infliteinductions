
-- Test script to create sample data for expiry notifications

-- First, let's check what courses exist and update one with expiry settings
UPDATE courses 
SET valid_for_days = 365, 
    retake_reminder_days = 30
WHERE id = (SELECT id FROM courses LIMIT 1);

-- Create a test assignment that will expire soon (completed 340 days ago, so expires in 25 days)
-- This should trigger a reminder since it's within the 30-day reminder window
INSERT INTO course_assignments (
  id,
  user_id,
  course_id,
  assignment_status,
  completed_at,
  created_at,
  updated_at
) 
SELECT 
  gen_random_uuid(),
  p.id as user_id,
  c.id as course_id,
  'completed',
  (CURRENT_DATE - INTERVAL '340 days') as completed_at,
  now(),
  now()
FROM profiles p 
CROSS JOIN courses c 
WHERE c.valid_for_days IS NOT NULL
LIMIT 1
ON CONFLICT (id) DO NOTHING;

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
