-- =========================================================
-- Fix RLS Policies for Trainers/Assessors
-- Connor has data but can't see it = RLS issue
-- =========================================================

-- 1. CHECK CURRENT RLS STATUS AND POLICIES
-- =========================================================

-- Check if RLS is enabled on course_assignments
SELECT 
    'course_assignments' as table_name,
    CASE 
        WHEN rowsecurity THEN 'RLS ENABLED - This is likely the issue!'
        ELSE 'RLS DISABLED - Not the issue'
    END as rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'course_assignments';

-- Show existing policies on course_assignments
SELECT 
    policyname,
    cmd as operation,
    CASE 
        WHEN policyname LIKE '%trainer%' OR policyname LIKE '%assessor%' 
        THEN 'TRAINER/ASSESSOR POLICY'
        ELSE 'OTHER POLICY'
    END as policy_type
FROM pg_policies 
WHERE tablename = 'course_assignments'
ORDER BY policyname;

-- 2. ADD MISSING RLS POLICIES FOR TRAINERS/ASSESSORS
-- =========================================================

-- Policy 1: Trainers/Assessors can see their own assignments
DROP POLICY IF EXISTS "trainers_assessors_see_own_assignments" ON public.course_assignments;

CREATE POLICY "trainers_assessors_see_own_assignments"
ON public.course_assignments
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() 
    AND role IN ('onsite_trainer', 'onsite_assessor')
);

-- Policy 2: Trainers/Assessors can see all trainee assignments in their courses
DROP POLICY IF EXISTS "trainers_see_trainees_in_their_courses" ON public.course_assignments;

CREATE POLICY "trainers_see_trainees_in_their_courses"
ON public.course_assignments
FOR SELECT
TO authenticated
USING (
    role = 'trainee'
    AND course_id IN (
        SELECT course_id 
        FROM public.course_assignments 
        WHERE user_id = auth.uid() 
        AND role IN ('onsite_trainer', 'onsite_assessor')
    )
);

-- 3. CHECK IF PROFILES TABLE HAS RLS ISSUES
-- =========================================================

-- Check RLS on profiles table
SELECT 
    'profiles' as table_name,
    CASE 
        WHEN rowsecurity THEN 'RLS ENABLED'
        ELSE 'RLS DISABLED'
    END as rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'profiles';

-- Add policy for trainers to see trainee profiles (if missing)
DROP POLICY IF EXISTS "trainers_see_trainee_profiles" ON public.profiles;

CREATE POLICY "trainers_see_trainee_profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    -- Users can always see profiles of trainees in courses where they are trainer/assessor
    id IN (
        SELECT ca_trainee.user_id
        FROM public.course_assignments ca_trainee
        WHERE ca_trainee.role = 'trainee'
        AND ca_trainee.course_id IN (
            SELECT ca_trainer.course_id
            FROM public.course_assignments ca_trainer
            WHERE ca_trainer.user_id = auth.uid()
            AND ca_trainer.role IN ('onsite_trainer', 'onsite_assessor')
        )
    )
    OR id = auth.uid() -- Can always see own profile
);

-- 4. CHECK IF COURSES TABLE HAS RLS ISSUES
-- =========================================================

-- Check RLS on courses table
SELECT 
    'courses' as table_name,
    CASE 
        WHEN rowsecurity THEN 'RLS ENABLED'
        ELSE 'RLS DISABLED'
    END as rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'courses';

-- Add policy for trainers to see courses they're assigned to
DROP POLICY IF EXISTS "trainers_see_assigned_courses" ON public.courses;

CREATE POLICY "trainers_see_assigned_courses"
ON public.courses
FOR SELECT
TO authenticated
USING (
    -- Can see course if assigned as trainer/assessor
    id IN (
        SELECT course_id 
        FROM public.course_assignments 
        WHERE user_id = auth.uid() 
        AND role IN ('onsite_trainer', 'onsite_assessor')
    )
    OR status = 'published' -- Or if course is published
);

-- 5. CHECK ASSIGNMENT_PROGRESS TABLE RLS
-- =========================================================

-- Check RLS on assignment_progress
SELECT 
    'assignment_progress' as table_name,
    CASE 
        WHEN rowsecurity THEN 'RLS ENABLED'
        ELSE 'RLS DISABLED'
    END as rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'assignment_progress';

-- Add policy for trainers to see progress of trainees in their courses
DROP POLICY IF EXISTS "trainers_see_trainee_progress" ON public.assignment_progress;

CREATE POLICY "trainers_see_trainee_progress"
ON public.assignment_progress
FOR SELECT
TO authenticated
USING (
    assignment_id IN (
        SELECT ca_trainee.id
        FROM public.course_assignments ca_trainee
        WHERE ca_trainee.role = 'trainee'
        AND ca_trainee.course_id IN (
            SELECT ca_trainer.course_id
            FROM public.course_assignments ca_trainer
            WHERE ca_trainer.user_id = auth.uid()
            AND ca_trainer.role IN ('onsite_trainer', 'onsite_assessor')
        )
    )
);

-- 6. VERIFY THE FIXES WORK
-- =========================================================

-- Test Connor's access with the new policies
-- This simulates what happens when Connor is logged in
SELECT 
    'Testing with Connor''s auth context:' as test,
    COUNT(*) as should_see_16_trainer_assignments
FROM course_assignments
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND role IN ('onsite_trainer', 'onsite_assessor');

-- Test if Connor can see trainees in his courses
WITH connor_courses AS (
    SELECT course_id 
    FROM course_assignments 
    WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b' 
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
SELECT 
    'Trainees Connor should see:' as test,
    COUNT(DISTINCT ca.user_id) as trainee_count
FROM course_assignments ca
WHERE ca.role = 'trainee'
AND ca.course_id IN (SELECT course_id FROM connor_courses);

-- 7. SUMMARY OF CHANGES
-- =========================================================

SELECT 
    'RLS POLICIES ADDED:' as status,
    'trainers_assessors_see_own_assignments - Trainers can see their own assignments' as policy_1,
    'trainers_see_trainees_in_their_courses - Trainers can see trainees in their courses' as policy_2,
    'trainers_see_trainee_profiles - Trainers can see profiles of their trainees' as policy_3,
    'trainers_see_assigned_courses - Trainers can see courses they are assigned to' as policy_4,
    'trainers_see_trainee_progress - Trainers can see progress of their trainees' as policy_5;