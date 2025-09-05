
-- Test script to reset and complete the quiz test course to trigger authorization completion

-- Step 1: Find the current user and course IDs
SELECT 'CURRENT STATE:' as section;
SELECT 
    ca.id as assignment_id,
    ca.user_id,
    ca.course_id,
    ca.assignment_status,
    ca.completed_at,
    c.title as course_title,
    p.full_name as user_name
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
JOIN profiles p ON ca.user_id = p.id
WHERE c.title = 'quiz test course'
AND ca.role = 'trainee';

-- Step 2: Check current authorization status
SELECT 'AUTHORIZATION STATUS:' as section;
SELECT 
    aa.id as auth_assignment_id,
    aa.authorisation_id,
    aa.assignment_status,
    aa.completed_at,
    a.title as auth_title,
    p.full_name as user_name
FROM authorisation_assignments aa
JOIN authorisations a ON aa.authorisation_id = a.id
JOIN profiles p ON aa.user_id = p.id
WHERE a.title = 'test Authorisation';

-- Step 3: Reset the quiz test course (clear progress and set back to assigned)
DELETE FROM assignment_progress 
WHERE assignment_id IN (
    SELECT ca.id 
    FROM course_assignments ca
    JOIN courses c ON ca.course_id = c.id
    WHERE c.title = 'quiz test course'
    AND ca.role = 'trainee'
);

UPDATE course_assignments 
SET 
    assignment_status = 'assigned',
    completed_at = NULL
WHERE id IN (
    SELECT ca.id 
    FROM course_assignments ca
    JOIN courses c ON ca.course_id = c.id
    WHERE c.title = 'quiz test course'
    AND ca.role = 'trainee'
);

-- Step 4: Get modules for the quiz test course to complete them
SELECT 'MODULES TO COMPLETE:' as section;
SELECT 
    cm.id as module_id,
    cm.title,
    cm.type,
    cm.order_index,
    ca.id as assignment_id
FROM course_modules cm
JOIN courses c ON cm.course_id = c.id
JOIN course_assignments ca ON ca.course_id = c.id
WHERE c.title = 'quiz test course'
AND ca.role = 'trainee'
ORDER BY cm.type, cm.order_index;

-- Step 5: Complete all modules for the quiz test course
-- (This will simulate the user completing all modules)
WITH quiz_assignment AS (
    SELECT ca.id as assignment_id
    FROM course_assignments ca
    JOIN courses c ON ca.course_id = c.id
    WHERE c.title = 'quiz test course'
    AND ca.role = 'trainee'
    LIMIT 1
),
quiz_modules AS (
    SELECT cm.id as module_id
    FROM course_modules cm
    JOIN courses c ON cm.course_id = c.id
    WHERE c.title = 'quiz test course'
)
INSERT INTO assignment_progress (assignment_id, module_id, created_at)
SELECT 
    qa.assignment_id,
    qm.module_id,
    NOW()
FROM quiz_assignment qa
CROSS JOIN quiz_modules qm
ON CONFLICT (assignment_id, module_id) DO NOTHING;

-- Step 6: Manually mark the assignment as completed (this should trigger the authorization completion logic)
UPDATE course_assignments 
SET 
    assignment_status = 'completed',
    completed_at = NOW()
WHERE id IN (
    SELECT ca.id 
    FROM course_assignments ca
    JOIN courses c ON ca.course_id = c.id
    WHERE c.title = 'quiz test course'
    AND ca.role = 'trainee'
);

-- Step 7: Check the results
SELECT 'FINAL STATE - COURSE:' as section;
SELECT 
    ca.id as assignment_id,
    ca.assignment_status,
    ca.completed_at,
    c.title as course_title,
    p.full_name as user_name
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
JOIN profiles p ON ca.user_id = p.id
WHERE c.title = 'quiz test course'
AND ca.role = 'trainee';

SELECT 'FINAL STATE - AUTHORIZATION:' as section;
SELECT 
    aa.id as auth_assignment_id,
    aa.assignment_status,
    aa.completed_at,
    a.title as auth_title,
    p.full_name as user_name
FROM authorisation_assignments aa
JOIN authorisations a ON aa.authorisation_id = a.id
JOIN profiles p ON aa.user_id = p.id
WHERE a.title = 'test Authorisation';

-- Step 8: Verify the trigger worked by checking all courses in the authorization
SELECT 'AUTHORIZATION COMPLETION CHECK:' as section;
WITH auth_courses AS (
    SELECT 
        a.id as auth_id,
        a.title as auth_title,
        COUNT(ac.course_id) as total_courses,
        COUNT(CASE WHEN ca.assignment_status = 'completed' THEN 1 END) as completed_courses
    FROM authorisations a
    JOIN authorisation_courses ac ON ac.authorisation_id = a.id
    LEFT JOIN course_assignments ca ON ca.course_id = ac.course_id 
        AND ca.user_id = (SELECT user_id FROM authorisation_assignments WHERE authorisation_id = a.id LIMIT 1)
        AND ca.role = 'trainee'
    WHERE a.title = 'test Authorisation'
    GROUP BY a.id, a.title
)
SELECT 
    auth_title,
    completed_courses,
    total_courses,
    CASE 
        WHEN completed_courses >= total_courses AND total_courses > 0 THEN 'SHOULD BE COMPLETED'
        ELSE 'STILL IN PROGRESS'
    END as expected_status
FROM auth_courses;
