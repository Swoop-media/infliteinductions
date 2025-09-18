-- Fix Stuck Authorization Query
-- Use this to manually move an authorization from 'assigned' to 'pending_approval'
-- when all courses are completed but it's not moving automatically

-- Replace these values with the actual IDs from your data:
-- USER_ID: The ID of the trainee
-- AUTHORIZATION_ID: The ID of the authorization

UPDATE authorisation_assignments
SET 
    assignment_status = 'pending_approval',
    completed_at = COALESCE(completed_at, NOW()),
    updated_at = NOW()
WHERE user_id = 'YOUR_USER_ID_HERE'::uuid
AND authorisation_id = 'YOUR_AUTHORIZATION_ID_HERE'::uuid
AND assignment_status = 'assigned'
AND role = 'trainee'
RETURNING 
    id,
    user_id,
    authorisation_id,
    assignment_status,
    completed_at,
    updated_at;

-- To find authorizations that should be moved to pending:
-- This query finds authorizations where all courses are completed but status is still 'assigned'
WITH completion_check AS (
    SELECT 
        aa.id,
        aa.user_id,
        aa.authorisation_id,
        aa.assignment_status,
        COUNT(DISTINCT ac.course_id) as total_courses,
        COUNT(DISTINCT CASE WHEN ca.assignment_status = 'completed' THEN ca.course_id END) as completed_courses
    FROM authorisation_assignments aa
    LEFT JOIN authorisation_courses ac ON aa.authorisation_id = ac.authorisation_id
    LEFT JOIN course_assignments ca ON ca.course_id = ac.course_id 
        AND ca.user_id = aa.user_id 
        AND ca.role = 'trainee'
    WHERE aa.role = 'trainee'
    AND aa.assignment_status = 'assigned'
    GROUP BY aa.id, aa.user_id, aa.authorisation_id, aa.assignment_status
)
SELECT 
    id,
    user_id,
    authorisation_id,
    assignment_status,
    total_courses,
    completed_courses,
    CASE 
        WHEN completed_courses = total_courses AND total_courses > 0 THEN 'Ready to move to pending'
        ELSE 'Not ready'
    END as status
FROM completion_check
WHERE completed_courses = total_courses 
AND total_courses > 0;