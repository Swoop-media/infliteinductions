-- =========================================================
-- Additional Debug Steps for Connor's Access Issues
-- When SQL shows data exists but UI doesn't display it
-- =========================================================

-- 1. CHECK ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================

-- Check if RLS is enabled on course_assignments
SELECT 
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'course_assignments';

-- Check what RLS policies exist on course_assignments
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'course_assignments'
ORDER BY policyname;

-- 2. CHECK IF CONNOR CAN ACCESS DATA WITH RLS
-- =========================================================

-- Test if Connor's auth.uid() would match his profile ID
-- This simulates what happens when Connor is logged in
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "464ef929-8116-47ac-8e95-10a09c14511b"}';

-- Now try the same query the app would run
SELECT 
    ca.id,
    ca.course_id,
    ca.role,
    ca.user_id,
    c.title as course_title
FROM course_assignments ca
LEFT JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND ca.role IN ('onsite_trainer', 'onsite_assessor');

-- Reset role
RESET role;

-- 3. CHECK FOR DATA INCONSISTENCIES
-- =========================================================

-- Check if Connor has duplicate or conflicting assignments
SELECT 
    course_id,
    array_agg(role) as roles,
    array_agg(id) as assignment_ids,
    COUNT(*) as assignment_count
FROM course_assignments
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
GROUP BY course_id
HAVING COUNT(*) > 1
ORDER BY course_id;

-- 4. CHECK COURSE VISIBILITY/STATUS
-- =========================================================

-- Check if courses are published/visible
SELECT 
    ca.course_id,
    ca.role,
    c.title,
    c.status as course_status,
    c.created_by,
    CASE 
        WHEN c.status = 'published' THEN 'Visible'
        WHEN c.status = 'draft' THEN 'Hidden (Draft)'
        WHEN c.status = 'archived' THEN 'Hidden (Archived)'
        ELSE 'Unknown status'
    END as visibility
FROM course_assignments ca
LEFT JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND ca.role IN ('onsite_trainer', 'onsite_assessor');

-- 5. CHECK FOR NULL/INVALID FOREIGN KEYS
-- =========================================================

-- Check if Connor's assignments reference non-existent courses
SELECT 
    ca.id,
    ca.course_id,
    ca.role,
    CASE 
        WHEN c.id IS NULL THEN 'COURSE DOES NOT EXIST!'
        ELSE 'Course exists'
    END as course_check
FROM course_assignments ca
LEFT JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND ca.role IN ('onsite_trainer', 'onsite_assessor');

-- 6. CHECK SESSION/AUTH CONSISTENCY
-- =========================================================

-- Check Connor's last login and session data
SELECT 
    id,
    email,
    last_sign_in_at,
    created_at,
    updated_at,
    raw_user_meta_data->>'full_name' as meta_full_name,
    raw_app_meta_data->>'provider' as auth_provider
FROM auth.users
WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- 7. CHECK ASSIGNMENT TIMESTAMPS
-- =========================================================

-- Check if assignments were created/modified recently
-- (might be timezone or timing issues)
SELECT 
    ca.id,
    ca.role,
    ca.created_at,
    ca.assigned_at,
    ca.updated_at,
    c.title,
    NOW() - ca.created_at as time_since_creation
FROM course_assignments ca
LEFT JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND ca.role IN ('onsite_trainer', 'onsite_assessor')
ORDER BY ca.created_at DESC;

-- 8. SIMULATE THE EXACT TRAIN-ASSESS PAGE QUERY
-- =========================================================

-- This is exactly what the train-assess page queries
WITH trainer_assignments AS (
    SELECT course_id, role
    FROM course_assignments
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    'Connor trainer courses:' as description,
    COUNT(*) as course_count,
    array_agg(course_id) as course_ids,
    array_agg(role) as roles
FROM trainer_assignments;

-- Then check trainees in those courses
WITH trainer_courses AS (
    SELECT course_id
    FROM course_assignments
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    ca.id,
    ca.user_id,
    ca.course_id,
    ca.created_at,
    p.full_name
FROM course_assignments ca
LEFT JOIN profiles p ON p.id = ca.user_id
WHERE ca.role = 'trainee'
    AND ca.course_id IN (SELECT course_id FROM trainer_courses);

-- 9. CHECK IF THERE'S A BROWSER/CLIENT ISSUE
-- =========================================================

SELECT 
    'Action items for Connor:' as instruction,
    '1. Clear browser cache and cookies' as step_1,
    '2. Try incognito/private browsing mode' as step_2,
    '3. Log out completely and log back in' as step_3,
    '4. Try a different browser' as step_4,
    '5. Check browser console for JavaScript errors (F12)' as step_5;

-- 10. FINAL DIAGNOSTIC SUMMARY
-- =========================================================

SELECT 
    'Potential issues found:' as diagnosis,
    (SELECT COUNT(*) FROM course_assignments WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b' AND role IN ('onsite_trainer', 'onsite_assessor')) as trainer_assignments,
    (SELECT COUNT(*) FROM courses c JOIN course_assignments ca ON ca.course_id = c.id WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b' AND ca.role IN ('onsite_trainer', 'onsite_assessor') AND c.status != 'published') as unpublished_courses,
    (SELECT last_sign_in_at FROM auth.users WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b') as last_login;