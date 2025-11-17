-- ================================================================
-- COMPLETE USER REMOVAL SCRIPT
-- Removes all traces of test users from the database
-- 
-- Run this in Supabase SQL Editor (not here in Replit)
-- ================================================================

-- Target emails to remove
-- henryafrica@hotmail.com
-- henrymorganskydive@gmail.com

BEGIN;

-- Step 1: Get user IDs (run this first to see what will be deleted)
SELECT 
    au.id as user_id,
    au.email,
    au.created_at,
    p.full_name
FROM auth.users au
LEFT JOIN profiles p ON p.id = au.id
WHERE au.email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com');

-- Step 2: Delete from all dependent tables
-- These have foreign key references to auth.users

-- Delete from learner_documents
DELETE FROM public.learner_documents 
WHERE user_id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
);

-- Delete from course_assignments
DELETE FROM public.course_assignments 
WHERE user_id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
);

-- Delete from authorization_assignments  
DELETE FROM public.authorization_assignments 
WHERE user_id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
);

-- Delete from assignment_progress
DELETE FROM public.assignment_progress 
WHERE assignment_id IN (
    SELECT id FROM public.course_assignments 
    WHERE user_id IN (
        SELECT id FROM auth.users 
        WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
    )
);

-- Delete from requirement_responses
DELETE FROM public.requirement_responses 
WHERE assignment_id IN (
    SELECT id FROM public.course_assignments 
    WHERE user_id IN (
        SELECT id FROM auth.users 
        WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
    )
);

-- Delete from quiz_responses
DELETE FROM public.quiz_responses 
WHERE user_id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
);

-- Delete from notifications
DELETE FROM public.notifications 
WHERE user_id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
);

-- Delete from teams_links
DELETE FROM public.teams_links 
WHERE user_id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
);

-- Delete from user_roles
DELETE FROM public.user_roles 
WHERE user_id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
);

-- Step 3: Delete from profiles table
DELETE FROM public.profiles 
WHERE id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
);

-- Step 4: Finally delete from auth.users
-- This is the main authentication table
DELETE FROM auth.users 
WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com');

-- Also check and delete from auth.identities if exists
DELETE FROM auth.identities 
WHERE user_id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com')
);

COMMIT;

-- Verify deletion was successful
SELECT COUNT(*) as remaining_users 
FROM auth.users 
WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com');