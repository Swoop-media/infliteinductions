
-- Quick test: Update course to trigger expiry notifications

-- First, let's see what we have
SELECT 'CURRENT COURSE SETTINGS:' as section;
SELECT 
  id,
  title,
  valid_for_days,
  retake_reminder_days,
  created_by
FROM courses 
ORDER BY created_at DESC 
LIMIT 3;

-- Get the test assignment we want to trigger
SELECT 'CURRENT TEST ASSIGNMENTS:' as section;
SELECT 
  ca.id,
  ca.user_id,
  ca.completed_at,
  c.title,
  c.valid_for_days,
  c.retake_reminder_days,
  (ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) as current_due_date,
  EXTRACT(days FROM ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE)) as days_until_expiry
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
WHERE ca.assignment_status = 'completed'
AND ca.completed_at IS NOT NULL
ORDER BY ca.created_at DESC
LIMIT 5;

-- Update the course to trigger notifications
-- Set valid_for_days to a number that will make existing completions due within 30 days
UPDATE courses 
SET 
  valid_for_days = 350,  -- This should make the 340-day-old completion due in ~10 days
  retake_reminder_days = 30
WHERE id = (
  SELECT c.id 
  FROM courses c
  JOIN course_assignments ca ON ca.course_id = c.id
  WHERE ca.assignment_status = 'completed'
  AND ca.completed_at IS NOT NULL
  LIMIT 1
);

-- Verify the change
SELECT 'UPDATED COURSE SETTINGS:' as section;
SELECT 
  ca.id as assignment_id,
  ca.user_id,
  ca.completed_at,
  c.title,
  c.valid_for_days,
  c.retake_reminder_days,
  (ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) as new_due_date,
  EXTRACT(days FROM ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE)) as days_until_expiry,
  CASE 
    WHEN EXTRACT(days FROM ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE)) > 0 
    AND EXTRACT(days FROM ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE)) <= c.retake_reminder_days 
    THEN 'SHOULD TRIGGER REMINDER'
    WHEN EXTRACT(days FROM ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE)) < 0
    AND EXTRACT(days FROM ((ca.completed_at::date + INTERVAL '1 day' * c.valid_for_days) - CURRENT_DATE)) >= -7
    THEN 'SHOULD TRIGGER EXPIRED'
    ELSE 'NO NOTIFICATION'
  END as notification_status
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
WHERE ca.assignment_status = 'completed'
AND ca.completed_at IS NOT NULL
ORDER BY days_until_expiry;
