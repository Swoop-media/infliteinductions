
-- Check if assignment exists and has correct user
SELECT 
    ca.id as assignment_id,
    ca.user_id,
    ca.course_id,
    ca.role,
    p.full_name
FROM course_assignments ca
LEFT JOIN profiles p ON p.id = ca.user_id
WHERE ca.id = '291be35f-80c9-4713-a676-01fb7ecad8df';

-- Check assignment progress entries
SELECT 
    ap.assignment_id,
    ap.module_id,
    ap.created_at,
    cm.title as module_title,
    cm.type as module_type
FROM assignment_progress ap
LEFT JOIN course_modules cm ON cm.id = ap.module_id
WHERE ap.assignment_id = '291be35f-80c9-4713-a676-01fb7ecad8df'
ORDER BY ap.created_at DESC;

-- Check all modules for this course
SELECT 
    id,
    title,
    type,
    order_index
FROM course_modules 
WHERE course_id = 'c7e65bae-bb3d-49d0-b992-fe4c09b15451'
ORDER BY type, order_index;
