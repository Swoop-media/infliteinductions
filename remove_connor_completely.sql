-- =========================================================
-- NUCLEAR OPTION: Complete removal of Connor Johnston
-- WARNING: This will delete ALL of Connor's data!
-- =========================================================
-- Run this script in your Supabase SQL Editor

-- Connor's user ID
-- User: Connor Johnston (connor.johnston@inflite.nz)
-- ID: 464ef929-8116-47ac-8e95-10a09c14511b

-- Step 1: BACKUP - Show Connor's current trainer/assessor assignments before deletion
SELECT 
    'BACKUP - Connor trainer/assessor assignments:' as backup_type,
    ca.course_id,
    c.title as course_title,
    ca.role,
    ca.created_at
FROM course_assignments ca
JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND ca.role IN ('onsite_trainer', 'onsite_assessor')
ORDER BY c.title, ca.role;

-- Step 2: Delete all related data (order matters due to foreign keys)

-- Delete form responses
DELETE FROM form_responses 
WHERE assignment_id IN (
    SELECT id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);

-- Delete requirement responses
DELETE FROM requirement_responses 
WHERE assignment_id IN (
    SELECT id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);

-- Delete quiz answers
DELETE FROM quiz_answers 
WHERE assignment_id IN (
    SELECT id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);

-- Delete assignment progress
DELETE FROM assignment_progress 
WHERE assignment_id IN (
    SELECT id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);

-- Delete assessor confirmations
DELETE FROM assessor_confirmations 
WHERE assessor_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete assessor equipment confirmations  
DELETE FROM assessor_equipment_confirmations 
WHERE assessor_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete equipment assessments
DELETE FROM equipment_assessments 
WHERE assessor_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete trainee equipment responses
DELETE FROM trainee_equipment_responses 
WHERE trainee_assignment_id IN (
    SELECT id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);

-- Delete form progress cache
DELETE FROM form_progress_cache 
WHERE assignment_id IN (
    SELECT id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);

-- Delete course assignments
DELETE FROM course_assignments 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete user roles
DELETE FROM user_roles 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete from profiles
DELETE FROM profiles 
WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Step 3: Delete from auth.users (Supabase authentication)
DELETE FROM auth.users 
WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Step 4: Verification
SELECT 
    'Connor Johnston removal complete!' as status,
    'Next steps:' as action,
    '1. Have Connor sign in fresh with Microsoft authentication' as step1,
    '2. Reassign his Admin and Trainer roles' as step2,
    '3. Reassign him to all 8 courses as trainer/assessor' as step3;

-- =========================================================
-- After Connor signs in fresh, you'll need to:
-- 1. Find his new user ID in the profiles table
-- 2. Manually reassign his trainer/assessor roles to courses
-- 3. Reassign his user roles (Admin, Trainer)
-- =========================================================