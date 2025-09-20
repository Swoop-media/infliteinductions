-- =========================================================
-- Fix Connor's missing "General" role
-- =========================================================

-- 1. Verify Connor's current roles
SELECT 
    'Current Connor roles:' as check,
    p.full_name,
    array_agg(r.name) as roles
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE p.id = '464ef929-8116-47ac-8e95-10a09c14511b'
GROUP BY p.id, p.full_name;

-- 2. Check if General role exists
SELECT 
    'General role info:' as check,
    id,
    name
FROM roles 
WHERE name = 'General';

-- 3. Add the General role to Connor
INSERT INTO user_roles (user_id, role_id)
SELECT 
    '464ef929-8116-47ac-8e95-10a09c14511b' as user_id,
    id as role_id
FROM roles 
WHERE name = 'General'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 4. Verify Connor now has both roles
SELECT 
    'Connor roles after fix:' as check,
    p.full_name,
    array_agg(r.name ORDER BY r.name) as roles
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE p.id = '464ef929-8116-47ac-8e95-10a09c14511b'
GROUP BY p.id, p.full_name;

-- 5. Compare with other working trainers
SELECT 
    'Role comparison after fix:' as check,
    p.full_name,
    array_agg(DISTINCT r.name ORDER BY r.name) as roles,
    'Should all have General + Trainers and Assessors' as expected
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE p.id IN (
    -- Connor and one other working trainer
    '464ef929-8116-47ac-8e95-10a09c14511b', -- Connor
    '121cb584-8ac1-4f33-a2a7-0438b6d29a6b'  -- Peter Hansen (working trainer)
)
GROUP BY p.id, p.full_name
ORDER BY p.full_name;

-- 6. Also check if Connor being a trainee in his own trainer courses is an issue
-- Remove Connor as trainee from courses where he's also a trainer (optional - only if needed)
/*
DELETE FROM course_assignments
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND role = 'trainee'
AND course_id IN (
    SELECT course_id 
    FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
);
*/