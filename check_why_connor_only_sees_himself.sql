-- =========================================================
-- Why can Connor only see himself as a trainee?
-- =========================================================

-- 1. Check what trainees ACTUALLY exist in Connor's courses
SELECT 
    'Actual trainees in Connor courses:' as check,
    c.title as course,
    ca.user_id,
    p.full_name,
    ca.role
FROM course_assignments ca
JOIN profiles p ON p.id = ca.user_id
JOIN courses c ON c.id = ca.course_id
WHERE ca.course_id IN (
    '54e82b81-b2db-49ee-b644-27e6b0ad4451', -- Sigma Packing
    'bdc908f2-0346-4678-9b96-ba76a6dc591b', -- Sigma passenger Harnessing
    'c7e65bae-bb3d-49d0-b992-fe4c09b15451'  -- Sigma 25 jump checks
)
AND ca.role = 'trainee'
ORDER BY c.title, p.full_name;

-- 2. Check RLS policies on course_assignments table
SELECT 
    'RLS policies on course_assignments:' as check,
    policyname,
    cmd as operation,
    roles,
    qual as condition
FROM pg_policies 
WHERE tablename = 'course_assignments'
AND schemaname = 'public'
ORDER BY policyname;

-- 3. Simulate Connor's query WITH auth context
-- This simulates what Connor sees when querying course_assignments
SET LOCAL jwt.claims.sub = '464ef929-8116-47ac-8e95-10a09c14511b';
SET LOCAL request.jwt.claim.sub = '464ef929-8116-47ac-8e95-10a09c14511b';

SELECT 
    'What Connor sees with RLS:' as query_as_connor,
    ca.id,
    ca.user_id,
    ca.course_id,
    ca.role,
    p.full_name
FROM course_assignments ca
LEFT JOIN profiles p ON p.id = ca.user_id
WHERE ca.role = 'trainee'
AND ca.course_id IN (
    '54e82b81-b2db-49ee-b644-27e6b0ad4451',
    'bdc908f2-0346-4678-9b96-ba76a6dc591b', 
    'c7e65bae-bb3d-49d0-b992-fe4c09b15451'
);

-- Reset context
RESET jwt.claims.sub;
RESET request.jwt.claim.sub;

-- 4. Check if there's a policy that restricts trainees to see only themselves
SELECT 
    'Restrictive SELECT policies:' as check,
    policyname,
    qual
FROM pg_policies 
WHERE tablename = 'course_assignments'
AND cmd = 'SELECT'
AND qual LIKE '%user_id%auth%uid%';