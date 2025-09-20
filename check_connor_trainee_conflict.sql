-- =========================================================
-- Check if Connor being both trainer and trainee causes issues
-- =========================================================

-- 1. Show courses where Connor is BOTH trainer/assessor AND trainee
SELECT 
    'Connor dual role courses:' as check,
    c.title,
    array_agg(DISTINCT ca.role ORDER BY ca.role) as connor_roles
FROM course_assignments ca
JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
GROUP BY c.id, c.title
HAVING COUNT(DISTINCT CASE WHEN ca.role IN ('onsite_trainer', 'onsite_assessor') THEN 1 END) > 0
   AND COUNT(DISTINCT CASE WHEN ca.role = 'trainee' THEN 1 END) > 0;

-- 2. Check if Peter Hansen (working trainer) is also a trainee in any of his trainer courses
SELECT 
    'Peter Hansen dual role check:' as check,
    c.title,
    array_agg(DISTINCT ca.role ORDER BY ca.role) as peter_roles
FROM course_assignments ca
JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '121cb584-8ac1-4f33-a2a7-0438b6d29a6b'
GROUP BY c.id, c.title
HAVING COUNT(DISTINCT CASE WHEN ca.role IN ('onsite_trainer', 'onsite_assessor') THEN 1 END) > 0;

-- 3. Test the exact query the train-assess page runs AS Connor
-- This simulates what happens when Connor loads the page
WITH connor_trainer_courses AS (
    SELECT course_id, role
    FROM course_assignments
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
),
trainee_assignments AS (
    SELECT 
        ca.id,
        ca.user_id,
        ca.course_id,
        ca.created_at
    FROM course_assignments ca
    WHERE ca.role = 'trainee'
    AND ca.course_id IN (SELECT course_id FROM connor_trainer_courses)
),
filtered_trainees AS (
    -- The page might be filtering out Connor himself if he's also a trainee
    SELECT * FROM trainee_assignments
    -- WHERE user_id != '464ef929-8116-47ac-8e95-10a09c14511b' -- Uncomment if page excludes self
)
SELECT 
    'Trainees Connor should see:' as check,
    COUNT(*) as trainee_count,
    COUNT(DISTINCT ft.user_id) as unique_trainees,
    array_agg(DISTINCT p.full_name) as trainee_names
FROM filtered_trainees ft
LEFT JOIN profiles p ON p.id = ft.user_id;

-- 4. Check if there's a browser cache/session issue
SELECT 
    'Connor last login check:' as info,
    'Connor may need to log out and back in to refresh his session' as suggestion,
    'Or clear browser cache/cookies for the site' as alternative;