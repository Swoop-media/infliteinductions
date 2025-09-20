-- =========================================================
-- Check if Connor's auth ID matches his profile ID
-- =========================================================

-- 1. Check Connor's profile details
SELECT 
    'Connor profile:' as check_type,
    id as profile_id,
    email,
    full_name,
    microsoft_id
FROM profiles 
WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- 2. Check if there's another profile with Connor's email
SELECT 
    'All profiles with Connor email:' as check_type,
    id as profile_id,
    email,
    full_name,
    microsoft_id
FROM profiles 
WHERE email = 'connor.johnston@inflite.nz'
OR full_name LIKE '%Connor%Johnston%';

-- 3. Check auth.users table (if accessible)
-- This shows the auth user IDs
SELECT 
    'Auth users matching Connor:' as check_type,
    id as auth_user_id,
    email
FROM auth.users
WHERE email = 'connor.johnston@inflite.nz';

-- 4. CRITICAL: Check if Connor has course_assignments with DIFFERENT user_ids
SELECT DISTINCT
    'Course assignments for Connor-related IDs:' as check_type,
    user_id,
    COUNT(*) as assignment_count,
    array_agg(DISTINCT role) as roles,
    array_agg(DISTINCT c.title) as courses
FROM course_assignments ca
JOIN courses c ON c.id = ca.course_id
WHERE user_id IN (
    SELECT id FROM profiles WHERE email = 'connor.johnston@inflite.nz' OR full_name LIKE '%Connor%Johnston%'
)
OR user_id IN (
    SELECT id FROM auth.users WHERE email = 'connor.johnston@inflite.nz'
)
GROUP BY user_id;

-- 5. The KEY check - does Connor's AUTH ID match his PROFILE ID?
WITH connor_auth AS (
    SELECT id FROM auth.users WHERE email = 'connor.johnston@inflite.nz'
),
connor_profile AS (
    SELECT id FROM profiles WHERE email = 'connor.johnston@inflite.nz'
)
SELECT 
    'ID Mismatch Check:' as diagnosis,
    (SELECT id FROM connor_auth) as auth_user_id,
    (SELECT id FROM connor_profile) as profile_id,
    CASE 
        WHEN (SELECT id FROM connor_auth) = (SELECT id FROM connor_profile) 
        THEN '✅ IDs match - no issue here'
        ELSE '❌ ID MISMATCH - THIS IS THE PROBLEM!'
    END as result;

-- 6. If there's a mismatch, we need to fix it
-- DO NOT RUN THIS YET - just shows what needs to be done
/*
UPDATE course_assignments 
SET user_id = (SELECT id FROM auth.users WHERE email = 'connor.johnston@inflite.nz')
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';
*/