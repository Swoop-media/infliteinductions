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
    ca.role
FROM course_assignments ca
JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND ca.role IN ('onsite_trainer', 'onsite_assessor')
ORDER BY c.title, ca.role;

-- Step 2: Delete all related data (order matters due to foreign keys)

-- Delete quiz attempts (quiz_answers might be stored in quiz_attempts.answers as JSONB)
DELETE FROM quiz_attempts 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
OR enrolment_id IN (
    SELECT id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);

-- Delete assignment progress
DELETE FROM assignment_progress 
WHERE assignment_id IN (
    SELECT id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);

-- Delete module progress (check if it uses assignment_id or user_id)
DELETE FROM module_progress 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete learner progress
DELETE FROM learner_progress 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete learner documents
DELETE FROM learner_documents 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete assessor equipment confirmations  
DELETE FROM assessor_equipment_confirmations 
WHERE assessor_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete assessor submissions
DELETE FROM assessor_submissions 
WHERE assessor_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete equipment assessments 
DELETE FROM equipment_assessments 
WHERE assessor_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete equipment submissions
DELETE FROM equipment_submissions 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete trainee equipment responses
DELETE FROM trainee_equipment_responses 
WHERE trainee_assignment_id IN (
    SELECT id FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);

-- Delete requirement responses
DELETE FROM requirement_responses 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete onsite requirement responses
DELETE FROM onsite_requirement_responses 
WHERE learner_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete onsite checks
DELETE FROM onsite_checks 
WHERE learner_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete onsite signoffs
DELETE FROM onsite_signoffs 
WHERE learner_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete onsite notes
DELETE FROM onsite_notes 
WHERE learner_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete authorisation assignments
DELETE FROM authorisation_assignments 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete authorisation completions
DELETE FROM authorisation_completions 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete course enrolments
DELETE FROM course_enrolments 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete course progress
DELETE FROM course_progress 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete contractor course completions
DELETE FROM contractor_course_completions 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete assigned trainers
DELETE FROM assigned_trainers 
WHERE trainer_id = '464ef929-8116-47ac-8e95-10a09c14511b'
OR trainee_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete course assignments (this is the main table)
DELETE FROM course_assignments 
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

-- Delete app user roles (not the same as user_roles)
DELETE FROM app_user_roles 
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