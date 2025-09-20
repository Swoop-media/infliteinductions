-- =========================================================
-- MINIMAL VERSION: Remove Connor Johnston (Essential tables only)
-- This script only touches the core tables to avoid column name issues
-- =========================================================

-- Connor's user ID: 464ef929-8116-47ac-8e95-10a09c14511b

-- Step 1: Check if Connor exists
SELECT 'Checking for Connor Johnston...' as status;
SELECT id, email FROM profiles WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Step 2: Delete from course_assignments (main assignment table)
DELETE FROM course_assignments WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Step 3: Delete from app_user_roles (from your table list)
DELETE FROM app_user_roles WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Step 4: Delete from user_roles
DELETE FROM user_roles WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Step 5: Delete from profiles
DELETE FROM profiles WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Step 6: Delete from auth.users (Supabase authentication)
DELETE FROM auth.users WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Verification
SELECT 
    'Connor Johnston has been removed!' as status,
    'Next steps:' as action,
    '1. Have Connor sign in fresh with Microsoft authentication' as step1,
    '2. Reassign his Admin and Trainer roles' as step2,
    '3. Reassign him to courses as trainer/assessor' as step3;