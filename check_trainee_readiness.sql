-- =========================================================
-- Check if trainees are ready for onsite training
-- =========================================================

-- Check the specific trainees' progress in Connor's courses
WITH connor_trainer_courses AS (
    -- Connor's trainer/assessor assignments
    SELECT DISTINCT course_id
    FROM course_assignments
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
),
trainee_assignments AS (
    -- Trainees in Connor's courses
    SELECT 
        ca.id as assignment_id,
        ca.user_id as trainee_id,
        ca.course_id,
        c.title as course_title,
        p.full_name as trainee_name
    FROM course_assignments ca
    JOIN connor_trainer_courses ctc ON ctc.course_id = ca.course_id
    JOIN courses c ON c.id = ca.course_id
    JOIN profiles p ON p.id = ca.user_id
    WHERE ca.role = 'trainee'
    AND ca.user_id != '464ef929-8116-47ac-8e95-10a09c14511b' -- Exclude Connor if he's also a trainee
)
SELECT 
    ta.course_title,
    ta.trainee_name,
    ta.assignment_id,
    -- Count digital modules in the course
    COUNT(DISTINCT cm.id) FILTER (WHERE cm.type IN ('digital_training', 'digital_assessment_quiz')) as total_digital_modules,
    -- Count completed digital modules
    COUNT(DISTINCT ap.module_id) FILTER (WHERE ap.completed_at IS NOT NULL) as completed_digital_modules,
    -- Calculate if ready
    CASE 
        WHEN COUNT(DISTINCT cm.id) FILTER (WHERE cm.type IN ('digital_training', 'digital_assessment_quiz')) = 0 THEN 'No digital modules - READY'
        WHEN COUNT(DISTINCT cm.id) FILTER (WHERE cm.type IN ('digital_training', 'digital_assessment_quiz')) = 
             COUNT(DISTINCT ap.module_id) FILTER (WHERE ap.completed_at IS NOT NULL) THEN '✅ READY FOR ONSITE'
        ELSE CONCAT('❌ Not ready - ', 
            COUNT(DISTINCT ap.module_id) FILTER (WHERE ap.completed_at IS NOT NULL), 
            '/', 
            COUNT(DISTINCT cm.id) FILTER (WHERE cm.type IN ('digital_training', 'digital_assessment_quiz')),
            ' digital modules completed')
    END as status
FROM trainee_assignments ta
LEFT JOIN course_modules cm ON cm.course_id = ta.course_id
LEFT JOIN assignment_progress ap ON ap.assignment_id = ta.assignment_id AND ap.module_id = cm.id
GROUP BY ta.course_title, ta.trainee_name, ta.trainee_id, ta.assignment_id
ORDER BY ta.course_title, ta.trainee_name;

-- Also check: What's the actual assignment progress data?
SELECT 
    'Raw assignment_progress check:' as check_type,
    ca.user_id,
    p.full_name,
    c.title as course,
    COUNT(ap.id) as progress_records,
    COUNT(ap.completed_at) as completed_records
FROM course_assignments ca
JOIN profiles p ON p.id = ca.user_id
JOIN courses c ON c.id = ca.course_id
LEFT JOIN assignment_progress ap ON ap.assignment_id = ca.id
WHERE ca.course_id IN (
    SELECT DISTINCT course_id 
    FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
AND ca.role = 'trainee'
GROUP BY ca.user_id, p.full_name, c.title
ORDER BY p.full_name, c.title;