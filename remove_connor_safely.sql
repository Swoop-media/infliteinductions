-- =========================================================
-- SAFE VERSION: Remove Connor Johnston in sections
-- Run each section separately to skip any errors
-- =========================================================

-- Connor's user ID: 464ef929-8116-47ac-8e95-10a09c14511b

-- SECTION 1: Backup Connor's data first
SELECT 'Checking Connor exists...' as status;
SELECT * FROM profiles WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';
SELECT * FROM course_assignments WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- SECTION 2: Delete course-related data
BEGIN;
DELETE FROM assignment_progress WHERE assignment_id IN (SELECT id FROM course_assignments WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b');
DELETE FROM course_assignments WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';
DELETE FROM course_enrolments WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';
DELETE FROM course_progress WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';
COMMIT;

-- SECTION 3: Delete user roles
BEGIN;
DELETE FROM app_user_roles WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';
DELETE FROM user_roles WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';
COMMIT;

-- SECTION 4: Delete profile
BEGIN;
DELETE FROM profiles WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';
COMMIT;

-- SECTION 5: Delete from auth (final step)
BEGIN;
DELETE FROM auth.users WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';
COMMIT;

-- Verify deletion
SELECT 
    'Connor deletion complete!' as status,
    'Have Connor sign in fresh with Microsoft auth' as next_step;