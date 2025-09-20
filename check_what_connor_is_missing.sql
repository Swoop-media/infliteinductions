-- =========================================================
-- Check what's different between Connor and working users
-- =========================================================

-- 1. Check if Connor is missing from profiles table
SELECT 
    'Connor in profiles?' as check,
    EXISTS(SELECT 1 FROM profiles WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b') as exists;

-- 2. Check if Connor has the Trainers and Assessors ROLE (not course assignment role)
SELECT 
    p.id,
    p.full_name,
    p.email,
    array_agg(r.name) as user_roles
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE p.id = '464ef929-8116-47ac-8e95-10a09c14511b'
GROUP BY p.id, p.full_name, p.email;

-- 3. Compare Connor with a working trainer/assessor
-- Replace 'YOUR_USER_ID' with your user ID that works
/*
SELECT 
    'Your roles:' as user_type,
    p.id,
    p.full_name,
    array_agg(r.name) as user_roles
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE p.email = 'YOUR_EMAIL@inflite.nz' -- Replace with your email
GROUP BY p.id, p.full_name;
*/

-- 4. Check if the issue is with the has_role function
-- The app might be checking for "Trainers and Assessors" role, not course assignments
SELECT 
    'Connor has Trainers and Assessors role?' as check,
    public.has_role('464ef929-8116-47ac-8e95-10a09c14511b', 'Trainers and Assessors') as result;

-- 5. If Connor doesn't have the role, grant it to him
-- ONLY RUN THIS IF THE ABOVE CHECK RETURNS FALSE
/*
INSERT INTO user_roles (user_id, role_id)
SELECT 
    '464ef929-8116-47ac-8e95-10a09c14511b',
    id
FROM roles
WHERE name = 'Trainers and Assessors'
ON CONFLICT (user_id, role_id) DO NOTHING;
*/