-- FIX TRAINER ASSIGNMENTS - Add trainers back to courses
-- This query will add Henry Morgan as trainer/assessor to courses with pending training

-- First, let's see which courses have pending training but NO trainers
WITH courses_needing_trainers AS (
    SELECT DISTINCT c.id, c.title
    FROM courses c
    JOIN course_modules cm ON c.id = cm.course_id
    JOIN course_assignments ca ON c.id = ca.course_id
    WHERE cm.type IN ('onsite_training', 'onsite_assessment')
    AND ca.role = 'trainee'
    AND ca.assignment_status IN ('approved', 'in_progress')
    AND NOT EXISTS (
        -- Check if course already has trainers
        SELECT 1 FROM course_assignments ca2
        WHERE ca2.course_id = c.id
        AND ca2.role IN ('onsite_trainer', 'onsite_assessor')
    )
)
SELECT * FROM courses_needing_trainers;

-- IMPORTANT: Review the list above first!
-- Then uncomment and run the INSERT below to add Henry Morgan as trainer/assessor

/*
-- Add Henry Morgan as trainer AND assessor for courses that need it
INSERT INTO course_assignments (id, user_id, course_id, role, assignment_status, created_at, updated_at)
WITH courses_to_assign AS (
    SELECT DISTINCT c.id as course_id
    FROM courses c
    JOIN course_modules cm ON c.id = cm.course_id
    JOIN course_assignments ca ON c.id = ca.course_id
    WHERE cm.type IN ('onsite_training', 'onsite_assessment')
    AND ca.role = 'trainee'
    AND ca.assignment_status IN ('approved', 'in_progress')
    AND NOT EXISTS (
        SELECT 1 FROM course_assignments ca2
        WHERE ca2.course_id = c.id
        AND ca2.role IN ('onsite_trainer', 'onsite_assessor')
    )
)
SELECT 
    gen_random_uuid() as id,
    '1b44c8f5-95aa-4f8c-8110-8f36106b4d10' as user_id, -- Henry Morgan's ID
    course_id,
    role,
    'approved' as assignment_status,
    NOW() as created_at,
    NOW() as updated_at
FROM courses_to_assign
CROSS JOIN (VALUES ('onsite_trainer'), ('onsite_assessor')) AS roles(role);
*/

-- Alternative: Add multiple trainers to different courses
-- You can customize this based on which trainers should handle which courses

/*
-- Example: Assign specific trainers to specific courses
INSERT INTO course_assignments (id, user_id, course_id, role, assignment_status, created_at, updated_at)
VALUES
    -- Henry Morgan for High Altitude Skydiving
    (gen_random_uuid(), '1b44c8f5-95aa-4f8c-8110-8f36106b4d10', 
     (SELECT id FROM courses WHERE title LIKE '%High Altitude%' LIMIT 1), 
     'onsite_trainer', 'approved', NOW(), NOW()),
    (gen_random_uuid(), '1b44c8f5-95aa-4f8c-8110-8f36106b4d10', 
     (SELECT id FROM courses WHERE title LIKE '%High Altitude%' LIMIT 1), 
     'onsite_assessor', 'approved', NOW(), NOW()),
     
    -- Damien Ettema for Driver Training
    (gen_random_uuid(), '57bee71d-45ac-4e99-9765-1b1221b516b5', 
     (SELECT id FROM courses WHERE title LIKE '%Driver Training%' LIMIT 1), 
     'onsite_trainer', 'approved', NOW(), NOW()),
    (gen_random_uuid(), '57bee71d-45ac-4e99-9765-1b1221b516b5', 
     (SELECT id FROM courses WHERE title LIKE '%Driver Training%' LIMIT 1), 
     'onsite_assessor', 'approved', NOW(), NOW());
*/

-- Verify trainer assignments after adding them
SELECT 
    c.title as course_name,
    ca.role,
    p.full_name as trainer_name,
    COUNT(DISTINCT ca2.user_id) as trainee_count
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
JOIN profiles p ON ca.user_id = p.id
LEFT JOIN course_assignments ca2 ON ca2.course_id = ca.course_id AND ca2.role = 'trainee'
WHERE ca.role IN ('onsite_trainer', 'onsite_assessor')
GROUP BY c.title, ca.role, p.full_name
ORDER BY c.title, ca.role;