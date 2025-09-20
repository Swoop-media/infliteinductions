-- =========================================================
-- Fix RLS for assignment_progress to allow trainers to see trainee progress
-- =========================================================

-- 1. First, verify the issue - Connor can't see trainee progress
SELECT 
    'Connor visibility test:' as test,
    COUNT(*) as visible_progress_records
FROM assignment_progress ap
JOIN course_assignments ca ON ca.id = ap.assignment_id
WHERE ca.user_id IN (
    -- Peter Hansen and Henry Morgan's IDs
    SELECT id FROM profiles WHERE full_name IN ('Peter Hansen', 'Henry Morgan')
);

-- 2. Check current RLS policies on assignment_progress
SELECT 
    policyname,
    cmd as operation,
    qual as policy_condition
FROM pg_policies 
WHERE tablename = 'assignment_progress'
AND schemaname = 'public'
ORDER BY policyname;

-- 3. Create new policy to allow trainers/assessors to read progress for their assigned courses
CREATE POLICY "trainers_can_read_trainee_progress" 
ON public.assignment_progress
FOR SELECT 
TO authenticated
USING (
    -- Allow trainers/assessors to see progress for trainees in their courses
    EXISTS (
        SELECT 1 
        FROM course_assignments ca_trainer
        JOIN course_assignments ca_trainee ON ca_trainee.id = assignment_progress.assignment_id
        WHERE ca_trainer.user_id = auth.uid()
        AND ca_trainer.role IN ('onsite_trainer', 'onsite_assessor')
        AND ca_trainer.course_id = ca_trainee.course_id
    )
);

-- 4. Verify the fix - Connor should now see trainee progress
SELECT 
    'After fix - Connor visibility:' as test,
    COUNT(*) as visible_progress_records,
    COUNT(DISTINCT ca.user_id) as unique_trainees,
    array_agg(DISTINCT p.full_name) as trainee_names
FROM assignment_progress ap
JOIN course_assignments ca ON ca.id = ap.assignment_id
JOIN profiles p ON p.id = ca.user_id
WHERE ca.course_id IN (
    SELECT DISTINCT course_id 
    FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
AND ca.role = 'trainee';

-- 5. Summary of what this fixes
SELECT 
    'Fix summary:' as status,
    'Trainers and assessors can now see assignment progress for trainees in their courses' as result,
    'Connor should now see pending training items on the train-assess page' as expected_outcome;