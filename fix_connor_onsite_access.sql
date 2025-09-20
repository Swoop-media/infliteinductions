-- =========================================================
-- Fix Connor Johnston's Onsite Access Issues
-- User ID: 464ef929-8116-47ac-8e95-10a09c14511b
-- =========================================================

-- STEP 1: VERIFY CONNOR'S PROFILE AND AUTH.USERS ALIGNMENT
-- =========================================================

-- Check if Connor exists in both profiles and auth.users
WITH connor_check AS (
    SELECT 
        'profile_exists' as check_type,
        EXISTS(SELECT 1 FROM profiles WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b') as result
    UNION ALL
    SELECT 
        'auth_user_exists' as check_type,
        EXISTS(SELECT 1 FROM auth.users WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b') as result
)
SELECT * FROM connor_check;

-- If Connor exists in profiles but not in auth.users, create the auth.users record
-- NOTE: Only run this if auth_user_exists = false above!
/*
INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    role
)
SELECT 
    p.id,
    p.email,
    '', -- Empty password for SSO users
    NOW(),
    NOW(),
    NOW(),
    jsonb_build_object(
        'provider', 'azuread',
        'providers', ARRAY['azuread']
    ),
    jsonb_build_object(
        'email', p.email,
        'full_name', p.full_name
    ),
    true, -- SSO user
    'authenticated'
FROM profiles p
WHERE p.id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b'
);
*/

-- STEP 2: CHECK CONNOR'S CURRENT ONSITE ASSIGNMENTS
-- =========================================================

-- Show Connor's current course assignments with trainer/assessor roles
SELECT 
    ca.id,
    ca.course_id,
    ca.role,
    ca.assignment_status,
    c.title as course_title,
    ca.created_at,
    ca.assigned_at,
    ca.assigned_by
FROM course_assignments ca
LEFT JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND ca.role IN ('onsite_trainer', 'onsite_assessor', 'trainer', 'assessor')
ORDER BY ca.created_at DESC;

-- STEP 3: FIX LEGACY ROLE VALUES (trainer -> onsite_trainer, assessor -> onsite_assessor)
-- =========================================================

-- Update any legacy 'trainer' roles to 'onsite_trainer' for Connor
UPDATE course_assignments
SET role = 'onsite_trainer'
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role = 'trainer';

-- Update any legacy 'assessor' roles to 'onsite_assessor' for Connor
UPDATE course_assignments
SET role = 'onsite_assessor'
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role = 'assessor';

-- STEP 4: VERIFY THERE ARE TRAINEES IN CONNOR'S COURSES
-- =========================================================

-- Check if there are any trainees in courses where Connor is trainer/assessor
WITH connor_trainer_courses AS (
    SELECT DISTINCT course_id 
    FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b' 
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    ca.course_id,
    c.title as course_title,
    COUNT(DISTINCT ca.user_id) as trainee_count,
    COUNT(DISTINCT CASE WHEN ca.assignment_status = 'in_progress' THEN ca.user_id END) as in_progress_count,
    COUNT(DISTINCT CASE WHEN ca.assignment_status = 'completed' THEN ca.user_id END) as completed_count
FROM connor_trainer_courses ctc
JOIN course_assignments ca ON ca.course_id = ctc.course_id
LEFT JOIN courses c ON c.id = ca.course_id
WHERE ca.role = 'trainee'
GROUP BY ca.course_id, c.title
ORDER BY c.title;

-- STEP 5: CHECK MODULE COMPLETION FOR TRAINEES (Required for onsite training to appear)
-- =========================================================

-- For trainees to appear in "Ready for Onsite Training", they must have completed digital modules
WITH connor_trainer_courses AS (
    SELECT DISTINCT course_id 
    FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b' 
    AND role IN ('onsite_trainer', 'onsite_assessor')
),
trainee_assignments AS (
    SELECT 
        ca.id as assignment_id,
        ca.user_id as trainee_id,
        ca.course_id,
        p.full_name as trainee_name
    FROM course_assignments ca
    JOIN connor_trainer_courses ctc ON ctc.course_id = ca.course_id
    LEFT JOIN profiles p ON p.id = ca.user_id
    WHERE ca.role = 'trainee'
)
SELECT 
    ta.trainee_name,
    c.title as course_title,
    COUNT(DISTINCT cm.id) as total_digital_modules,
    COUNT(DISTINCT ap.module_id) as completed_digital_modules,
    CASE 
        WHEN COUNT(DISTINCT cm.id) = COUNT(DISTINCT ap.module_id) 
        THEN 'Ready for onsite training'
        ELSE 'Still completing digital modules'
    END as status
FROM trainee_assignments ta
JOIN courses c ON c.id = ta.course_id
LEFT JOIN course_modules cm ON cm.course_id = ta.course_id 
    AND cm.type IN ('digital_training', 'digital_assessment_quiz')
LEFT JOIN assignment_progress ap ON ap.assignment_id = ta.assignment_id 
    AND ap.module_id = cm.id
    AND ap.completed_at IS NOT NULL
GROUP BY ta.trainee_id, ta.trainee_name, ta.course_id, c.title
ORDER BY c.title, ta.trainee_name;

-- STEP 6: VERIFY ONSITE MODULES EXIST
-- =========================================================

-- Check if onsite training/assessment modules exist for Connor's courses
WITH connor_trainer_courses AS (
    SELECT DISTINCT course_id 
    FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b' 
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    cm.course_id,
    c.title as course_title,
    cm.type as module_type,
    COUNT(*) as module_count
FROM course_modules cm
JOIN connor_trainer_courses ctc ON ctc.course_id = cm.course_id
LEFT JOIN courses c ON c.id = cm.course_id
WHERE cm.type IN ('onsite_training', 'onsite_assessment')
GROUP BY cm.course_id, c.title, cm.type
ORDER BY c.title, cm.type;

-- STEP 7: SUMMARY AND RECOMMENDATIONS
-- =========================================================

SELECT 
    'Run these checks in order:' as instructions,
    '1. Check if Connor exists in auth.users - if not, uncomment and run the INSERT' as step_1,
    '2. Legacy roles have been updated to onsite_trainer/onsite_assessor' as step_2,
    '3. Verify trainees exist in Connor''s courses' as step_3,
    '4. Check if trainees have completed digital modules (required for onsite)' as step_4,
    '5. Verify onsite modules exist for the courses' as step_5;

-- DIAGNOSTIC QUERY: What Connor should see on train-assess page
WITH connor_trainer_courses AS (
    SELECT DISTINCT 
        course_id,
        role
    FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b' 
    AND role IN ('onsite_trainer', 'onsite_assessor')
),
trainee_with_digital_complete AS (
    SELECT 
        ca.id,
        ca.user_id,
        ca.course_id,
        p.full_name,
        -- Check if all digital modules are complete
        CASE 
            WHEN COUNT(DISTINCT cm_digital.id) = COUNT(DISTINCT ap.module_id) 
            THEN true 
            ELSE false 
        END as digital_complete
    FROM course_assignments ca
    JOIN connor_trainer_courses ctc ON ctc.course_id = ca.course_id
    LEFT JOIN profiles p ON p.id = ca.user_id
    LEFT JOIN course_modules cm_digital ON cm_digital.course_id = ca.course_id 
        AND cm_digital.type IN ('digital_training', 'digital_assessment_quiz')
    LEFT JOIN assignment_progress ap ON ap.assignment_id = ca.id 
        AND ap.module_id = cm_digital.id 
        AND ap.completed_at IS NOT NULL
    WHERE ca.role = 'trainee'
    GROUP BY ca.id, ca.user_id, ca.course_id, p.full_name
)
SELECT 
    'Connor should see these in Ready for Onsite Training:' as description,
    COUNT(*) FILTER (WHERE digital_complete = true) as ready_for_training_count,
    array_agg(full_name) FILTER (WHERE digital_complete = true) as ready_trainees
FROM trainee_with_digital_complete;