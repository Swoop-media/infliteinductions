-- ================================================================
-- SIMPLE USER REMOVAL SCRIPT - RUN IN SUPABASE SQL EDITOR
-- ================================================================

-- STEP 1: First check if these users exist
SELECT 
    au.id as user_id,
    au.email,
    p.full_name
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE au.email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com');

-- STEP 2: If users exist, run this to delete them completely
-- (Comment out STEP 1 and uncomment below to run)

/*
BEGIN;

-- Delete from all dependent tables first
DELETE FROM public.learner_documents WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com'));
DELETE FROM public.quiz_responses WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com'));
DELETE FROM public.notifications WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com'));
DELETE FROM public.teams_links WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com'));
DELETE FROM public.authorization_assignments WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com'));
DELETE FROM public.course_assignments WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com'));
DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com'));
DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com'));

-- Finally delete from auth tables
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com'));
DELETE FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com');

COMMIT;

-- Verify deletion
SELECT COUNT(*) as remaining FROM auth.users WHERE email IN ('henryafrica@hotmail.com', 'henrymorganskydive@gmail.com');
*/