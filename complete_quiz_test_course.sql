
-- Complete the quiz test course assignment since all digital modules are done

-- Update the quiz test course assignment to completed status
UPDATE course_assignments 
SET 
    assignment_status = 'completed',
    completed_at = NOW()
WHERE course_id = (
    SELECT id FROM courses WHERE title = 'quiz test course'
)
AND role = 'trainee'
AND assignment_status != 'completed';

-- Check the result
SELECT 
    ca.assignment_status,
    ca.completed_at,
    c.title as course_title,
    p.full_name as user_name
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
JOIN profiles p ON ca.user_id = p.id
WHERE c.title = 'quiz test course'
AND ca.role = 'trainee';

-- Check if this triggers authorization completion
SELECT 
    aa.assignment_status,
    aa.completed_at,
    a.title as auth_title
FROM authorisation_assignments aa
JOIN authorisations a ON aa.authorisation_id = a.id
WHERE a.title = 'test Authorisation';
