-- =========================================================
-- Check if there are trainees in Connor's courses
-- =========================================================

-- 1. List Connor's courses
WITH connor_courses AS (
    SELECT DISTINCT course_id, title
    FROM course_assignments ca
    JOIN courses c ON c.id = ca.course_id
    WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND ca.role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    'Connor is trainer/assessor for these courses:' as info,
    COUNT(*) as course_count,
    array_agg(title) as course_titles
FROM connor_courses;

-- 2. Check if there are ANY trainees in Connor's courses
WITH connor_courses AS (
    SELECT DISTINCT course_id
    FROM course_assignments
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    c.title as course_title,
    COUNT(DISTINCT ca.user_id) as trainee_count,
    array_agg(DISTINCT p.full_name) as trainee_names
FROM connor_courses cc
JOIN courses c ON c.id = cc.course_id
LEFT JOIN course_assignments ca ON ca.course_id = cc.course_id AND ca.role = 'trainee'
LEFT JOIN profiles p ON p.id = ca.user_id
GROUP BY c.id, c.title
ORDER BY c.title;

-- 3. Check module structure for Connor's courses
WITH connor_courses AS (
    SELECT DISTINCT course_id
    FROM course_assignments
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    c.title as course_title,
    cm.type as module_type,
    COUNT(*) as module_count
FROM connor_courses cc
JOIN courses c ON c.id = cc.course_id
LEFT JOIN course_modules cm ON cm.course_id = cc.course_id
GROUP BY c.id, c.title, cm.type
ORDER BY c.title, cm.type;

-- 4. FOR ANY TRAINEES FOUND - Check their progress
WITH connor_courses AS (
    SELECT DISTINCT course_id
    FROM course_assignments
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
),
trainees_in_connor_courses AS (
    SELECT 
        ca.id as assignment_id,
        ca.user_id as trainee_id,
        ca.course_id,
        c.title as course_title,
        p.full_name as trainee_name
    FROM course_assignments ca
    JOIN connor_courses cc ON cc.course_id = ca.course_id
    JOIN courses c ON c.id = ca.course_id
    LEFT JOIN profiles p ON p.id = ca.user_id
    WHERE ca.role = 'trainee'
)
SELECT 
    tic.course_title,
    tic.trainee_name,
    COUNT(DISTINCT cm_digital.id) as total_digital_modules,
    COUNT(DISTINCT ap.module_id) as completed_digital_modules,
    CASE 
        WHEN COUNT(DISTINCT cm_digital.id) = 0 THEN 'No digital modules in course'
        WHEN COUNT(DISTINCT cm_digital.id) = COUNT(DISTINCT ap.module_id) THEN '✅ READY FOR ONSITE TRAINING'
        ELSE 'Still completing digital modules'
    END as trainee_status
FROM trainees_in_connor_courses tic
LEFT JOIN course_modules cm_digital ON cm_digital.course_id = tic.course_id 
    AND cm_digital.type IN ('digital_training', 'digital_assessment_quiz')
LEFT JOIN assignment_progress ap ON ap.assignment_id = tic.assignment_id 
    AND ap.module_id = cm_digital.id
    AND ap.completed_at IS NOT NULL
GROUP BY tic.course_title, tic.trainee_name, tic.trainee_id
ORDER BY tic.course_title, tic.trainee_name;

-- 5. CRITICAL CHECK: Are there onsite modules configured?
WITH connor_courses AS (
    SELECT DISTINCT course_id, title
    FROM course_assignments ca
    JOIN courses c ON c.id = ca.course_id
    WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND ca.role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    cc.title as course_title,
    COALESCE(COUNT(cm.id) FILTER (WHERE cm.type = 'onsite_training'), 0) as onsite_training_modules,
    COALESCE(COUNT(cm.id) FILTER (WHERE cm.type = 'onsite_assessment'), 0) as onsite_assessment_modules,
    CASE 
        WHEN COUNT(cm.id) FILTER (WHERE cm.type IN ('onsite_training', 'onsite_assessment')) = 0 
        THEN '❌ NO ONSITE MODULES CONFIGURED'
        ELSE '✅ Has onsite modules'
    END as status
FROM connor_courses cc
LEFT JOIN course_modules cm ON cm.course_id = cc.course_id
    AND cm.type IN ('onsite_training', 'onsite_assessment')
GROUP BY cc.course_id, cc.title
ORDER BY cc.title;