-- =========================================================
-- Deep dive into Connor's data integrity
-- =========================================================

-- 1. Check Connor's profile completeness
SELECT 
    id,
    full_name,
    email,
    department,
    microsoft_id,
    CASE 
        WHEN full_name IS NULL THEN 'MISSING FULL NAME!'
        WHEN email IS NULL THEN 'MISSING EMAIL!'
        ELSE 'Profile OK'
    END as profile_status
FROM profiles
WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- 2. Check if course_modules exist for Connor's courses
WITH connor_courses AS (
    SELECT DISTINCT course_id 
    FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b' 
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    c.title as course_title,
    COUNT(DISTINCT cm.id) as total_modules,
    COUNT(DISTINCT CASE WHEN cm.type = 'digital_training' THEN cm.id END) as digital_training,
    COUNT(DISTINCT CASE WHEN cm.type = 'digital_assessment_quiz' THEN cm.id END) as digital_quiz,
    COUNT(DISTINCT CASE WHEN cm.type = 'onsite_training' THEN cm.id END) as onsite_training,
    COUNT(DISTINCT CASE WHEN cm.type = 'onsite_assessment' THEN cm.id END) as onsite_assessment
FROM connor_courses cc
JOIN courses c ON c.id = cc.course_id
LEFT JOIN course_modules cm ON cm.course_id = cc.course_id
GROUP BY c.id, c.title
ORDER BY c.title;

-- 3. Check if RLS is actually disabled (which is why it was working)
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('course_assignments', 'profiles', 'courses', 'course_modules', 'assignment_progress')
ORDER BY tablename;

-- 4. Run the EXACT query the train-assess page runs (simplified)
-- First part: Get Connor's trainer assignments
WITH step1_trainer_assignments AS (
    SELECT course_id, role
    FROM course_assignments
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
),
-- Second part: Get trainee assignments in those courses
step2_trainee_assignments AS (
    SELECT 
        ca.id,
        ca.user_id,
        ca.course_id,
        ca.created_at,
        ca.role
    FROM course_assignments ca
    WHERE ca.role = 'trainee'
    AND ca.course_id IN (SELECT course_id FROM step1_trainer_assignments)
),
-- Third part: Check what's returned
step3_results AS (
    SELECT 
        COUNT(*) as trainee_count,
        array_agg(DISTINCT course_id) as course_ids
    FROM step2_trainee_assignments
)
SELECT 
    'Query simulation:' as test,
    trainee_count,
    course_ids
FROM step3_results;

-- 5. Check for null or unusual values in course_assignments
SELECT 
    'Data integrity check:' as check_type,
    COUNT(*) FILTER (WHERE user_id IS NULL) as null_user_ids,
    COUNT(*) FILTER (WHERE course_id IS NULL) as null_course_ids,
    COUNT(*) FILTER (WHERE role IS NULL) as null_roles,
    COUNT(*) FILTER (WHERE role NOT IN ('trainee', 'onsite_trainer', 'onsite_assessor', 'trainer', 'assessor')) as unknown_roles
FROM course_assignments
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
OR course_id IN (
    SELECT course_id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);

-- 6. Check if the problem is with specific courses
SELECT 
    ca.course_id,
    c.title,
    ca.role,
    COUNT(*) OVER (PARTITION BY ca.course_id) as assignments_per_course,
    CASE 
        WHEN c.id IS NULL THEN 'COURSE DOES NOT EXIST!'
        WHEN c.status != 'published' THEN 'COURSE NOT PUBLISHED!'
        ELSE 'OK'
    END as course_status
FROM course_assignments ca
LEFT JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND ca.role IN ('onsite_trainer', 'onsite_assessor')
ORDER BY c.title;