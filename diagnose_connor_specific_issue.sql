-- =========================================================
-- Find what's specifically different about Connor
-- =========================================================

-- 1. Compare Connor with other trainers/assessors on the same courses
WITH connor_courses AS (
    SELECT DISTINCT course_id 
    FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    'Other trainers/assessors on same courses:' as check,
    ca.user_id,
    p.full_name,
    p.email,
    array_agg(DISTINCT ca.role) as roles,
    COUNT(DISTINCT ca.course_id) as course_count
FROM course_assignments ca
JOIN profiles p ON p.id = ca.user_id
WHERE ca.course_id IN (SELECT course_id FROM connor_courses)
AND ca.role IN ('onsite_trainer', 'onsite_assessor')
AND ca.user_id != '464ef929-8116-47ac-8e95-10a09c14511b'
GROUP BY ca.user_id, p.full_name, p.email;

-- 2. Check if Connor's course_assignments have any NULL or unusual values
SELECT 
    'Connor assignments data quality:' as check,
    id,
    user_id,
    course_id,
    role,
    created_at,
    CASE 
        WHEN user_id IS NULL THEN 'NULL user_id!'
        WHEN course_id IS NULL THEN 'NULL course_id!'
        WHEN role IS NULL THEN 'NULL role!'
        WHEN created_at IS NULL THEN 'NULL created_at!'
        ELSE 'OK'
    END as data_status
FROM course_assignments
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND role IN ('onsite_trainer', 'onsite_assessor');

-- 3. Check Connor's profile for any missing fields
SELECT 
    'Connor profile completeness:' as check,
    id,
    email,
    full_name,
    department,
    microsoft_id,
    created_at,
    updated_at,
    CASE 
        WHEN email IS NULL THEN 'Missing email!'
        WHEN full_name IS NULL THEN 'Missing full_name!'
        ELSE 'Profile complete'
    END as profile_status
FROM profiles
WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- 4. Check if Connor is ALSO a trainee in the same courses (conflict?)
SELECT 
    'Connor as trainee in his trainer courses:' as check,
    c.title as course_title,
    array_agg(DISTINCT ca.role) as connor_roles
FROM course_assignments ca
JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND ca.course_id IN (
    SELECT course_id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
GROUP BY c.id, c.title;

-- 5. Check if other trainers' user_roles match Connor's
WITH connor_roles AS (
    SELECT array_agg(r.name ORDER BY r.name) as role_names
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
)
SELECT 
    'User role comparison:' as check,
    p.full_name,
    array_agg(r.name ORDER BY r.name) as user_roles,
    CASE 
        WHEN array_agg(r.name ORDER BY r.name) = (SELECT role_names FROM connor_roles) 
        THEN 'Same as Connor'
        ELSE 'Different from Connor'
    END as role_match
FROM course_assignments ca
JOIN profiles p ON p.id = ca.user_id
LEFT JOIN user_roles ur ON ur.user_id = ca.user_id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE ca.course_id IN (
    SELECT DISTINCT course_id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
AND ca.role IN ('onsite_trainer', 'onsite_assessor')
AND ca.user_id != '464ef929-8116-47ac-8e95-10a09c14511b'
GROUP BY p.id, p.full_name;

-- 6. CRITICAL: Check assignment_progress visibility for Connor vs others
-- Test if Connor can see progress records vs another trainer on same course
SELECT 
    'Who can see assignment_progress:' as test,
    'Connor sees:' as user,
    COUNT(*) as visible_records
FROM assignment_progress ap
WHERE EXISTS (
    SELECT 1 FROM course_assignments ca_trainee
    JOIN course_assignments ca_trainer ON ca_trainer.course_id = ca_trainee.course_id
    WHERE ca_trainee.id = ap.assignment_id
    AND ca_trainer.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND ca_trainer.role IN ('onsite_trainer', 'onsite_assessor')
);

-- 7. Check if Connor's assignments were created differently
SELECT 
    'Assignment creation comparison:' as check,
    user_id,
    COUNT(*) as assignment_count,
    MIN(created_at) as earliest_assignment,
    MAX(created_at) as latest_assignment,
    COUNT(DISTINCT DATE(created_at)) as different_creation_dates
FROM course_assignments
WHERE course_id IN (
    SELECT DISTINCT course_id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
AND role IN ('onsite_trainer', 'onsite_assessor')
GROUP BY user_id;