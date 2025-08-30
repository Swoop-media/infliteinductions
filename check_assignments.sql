
-- Check assignments for the specific user and course from the debug
SELECT 
    ca.*,
    p.full_name,
    c.title as course_title
FROM course_assignments ca
LEFT JOIN profiles p ON p.id = ca.user_id  
LEFT JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '1b44c8f5-95aa-4f8c-8110-8f36106b4d10'
   OR ca.course_id = 'c7e65bae-bb3d-49d0-b992-fe4c09b15451'
ORDER BY ca.course_id, ca.role;

-- Also check all assignments for that course to see who's assigned
SELECT 
    ca.role,
    ca.user_id,
    p.full_name,
    ca.created_at
FROM course_assignments ca
LEFT JOIN profiles p ON p.id = ca.user_id
WHERE ca.course_id = 'c7e65bae-bb3d-49d0-b992-fe4c09b15451'
ORDER BY ca.role, ca.created_at;

-- Check if there are any trainee assignments for this course
SELECT 
    'Trainee assignments' as type,
    ca.user_id,
    p.full_name,
    ca.created_at
FROM course_assignments ca
LEFT JOIN profiles p ON p.id = ca.user_id
WHERE ca.course_id = 'c7e65bae-bb3d-49d0-b992-fe4c09b15451'
AND ca.role = 'trainee';

-- Check onsite trainer assignments for this course  
SELECT 
    'Onsite trainer assignments' as type,
    ca.user_id,
    p.full_name,
    ca.created_at
FROM course_assignments ca
LEFT JOIN profiles p ON p.id = ca.user_id
WHERE ca.course_id = 'c7e65bae-bb3d-49d0-b992-fe4c09b15451'
AND ca.role = 'onsite_trainer';

-- Check progress for multi-role completion
WITH course_progress AS (
  SELECT 
    ca.role,
    ca.user_id,
    p.full_name,
    ca.assignment_status,
    ca.completed_at as assignment_completed,
    COUNT(ap.id) as modules_completed,
    STRING_AGG(cm.title, ', ') as completed_modules
  FROM course_assignments ca
  LEFT JOIN profiles p ON p.id = ca.user_id
  LEFT JOIN assignment_progress ap ON ap.assignment_id = ca.id
  LEFT JOIN course_modules cm ON cm.id = ap.module_id
  WHERE ca.course_id = 'c7e65bae-bb3d-49d0-b992-fe4c09b15451'
  GROUP BY ca.role, ca.user_id, p.full_name, ca.assignment_status, ca.completed_at
)
SELECT 
  'Multi-role progress' as type,
  role,
  full_name,
  assignment_status,
  modules_completed,
  completed_modules,
  assignment_completed
FROM course_progress
ORDER BY 
  CASE role 
    WHEN 'trainee' THEN 1 
    WHEN 'onsite_trainer' THEN 2 
    WHEN 'onsite_assessor' THEN 3 
  END;
