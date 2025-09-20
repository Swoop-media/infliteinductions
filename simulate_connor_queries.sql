-- =========================================================
-- Simulate the exact queries the train-assess page runs for Connor
-- =========================================================

-- Set Connor as the current user for RLS
SET LOCAL jwt.claims.sub = '464ef929-8116-47ac-8e95-10a09c14511b';
SET LOCAL request.jwt.claim.sub = '464ef929-8116-47ac-8e95-10a09c14511b';

-- 1. First query: Get Connor's trainer/assessor assignments
SELECT 
    'Step 1 - Connor trainer assignments:' as query_step,
    course_id, 
    role,
    c.title as course_title
FROM course_assignments ca
JOIN courses c ON c.id = ca.course_id
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND role IN ('onsite_trainer', 'onsite_assessor')
ORDER BY c.title;

-- 2. Get the course IDs where Connor is trainer/assessor
WITH trainer_course_ids AS (
    SELECT DISTINCT course_id 
    FROM course_assignments
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    'Step 2 - Course IDs where Connor is trainer:' as query_step,
    array_agg(course_id) as course_ids,
    COUNT(*) as course_count
FROM trainer_course_ids;

-- 3. Second query: Get trainee assignments in those courses
WITH trainer_course_ids AS (
    SELECT DISTINCT course_id 
    FROM course_assignments
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    'Step 3 - Trainee assignments in Connor courses:' as query_step,
    ca.id,
    ca.user_id,
    ca.course_id,
    ca.created_at,
    c.title as course_title,
    p.full_name as trainee_name
FROM course_assignments ca
JOIN trainer_course_ids tci ON tci.course_id = ca.course_id
JOIN courses c ON c.id = ca.course_id
LEFT JOIN profiles p ON p.id = ca.user_id
WHERE ca.role = 'trainee'
ORDER BY c.title, p.full_name;

-- 4. Check if RLS is blocking Connor from seeing trainees
SELECT 
    'RLS Check on key tables:' as check_type,
    tablename,
    COUNT(*) as policy_count,
    array_agg(policyname) as policies
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('course_assignments', 'profiles', 'courses', 'course_modules', 'assignment_progress')
GROUP BY tablename
ORDER BY tablename;

-- 5. Try a direct query to see all data Connor should be able to see
SELECT 
    'Direct check - what Connor can see:' as query_type,
    c.title as course,
    ca_trainer.role as connor_role,
    ca_trainee.user_id as trainee_id,
    p.full_name as trainee_name,
    ca_trainee.id as assignment_id
FROM course_assignments ca_trainer
JOIN course_assignments ca_trainee ON ca_trainee.course_id = ca_trainer.course_id
JOIN courses c ON c.id = ca_trainer.course_id
JOIN profiles p ON p.id = ca_trainee.user_id
WHERE ca_trainer.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND ca_trainer.role IN ('onsite_trainer', 'onsite_assessor')
AND ca_trainee.role = 'trainee'
ORDER BY c.title, p.full_name;

-- 6. Check if the issue is with the profiles table access
SELECT 
    'Can Connor see trainee profiles?' as check,
    COUNT(*) as visible_profiles
FROM profiles
WHERE id IN (
    SELECT DISTINCT ca_trainee.user_id
    FROM course_assignments ca_trainer
    JOIN course_assignments ca_trainee ON ca_trainee.course_id = ca_trainer.course_id
    WHERE ca_trainer.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND ca_trainer.role IN ('onsite_trainer', 'onsite_assessor')
    AND ca_trainee.role = 'trainee'
);