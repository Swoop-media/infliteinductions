-- Debug SQL Queries for Supabase SQL Editor
-- Run these queries in your Supabase SQL Editor to diagnose the issue

-- 1. Check RLS status on all relevant tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) as policy_count,
    CASE 
        WHEN rowsecurity = false THEN '✅ RLS Disabled - All users can access'
        WHEN rowsecurity = true AND (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) = 0 THEN '❌ RLS Enabled with NO policies - BLOCKS ALL ACCESS'
        WHEN rowsecurity = true AND (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) > 0 THEN '⚠️ RLS Enabled with policies - Check policies'
    END as status
FROM pg_tables t
WHERE schemaname = 'public' 
AND tablename IN ('module_content_blocks', 'course_modules', 'courses', 'profiles')
ORDER BY tablename;

-- 2. Check if there are any content blocks for the module
SELECT 
    COUNT(*) as total_blocks,
    module_id
FROM module_content_blocks
WHERE module_id = 'fccf166c-5594-4ab7-9530-6b959eb42a93'
GROUP BY module_id;

-- 3. List all content blocks for the module (should return data if blocks exist)
SELECT 
    id,
    module_id,
    kind,
    order_index,
    created_at,
    LENGTH(data::text) as data_size
FROM module_content_blocks
WHERE module_id = 'fccf166c-5594-4ab7-9530-6b959eb42a93'
ORDER BY order_index, created_at;

-- 4. Check module exists
SELECT 
    id,
    course_id,
    type,
    title
FROM course_modules
WHERE id = 'fccf166c-5594-4ab7-9530-6b959eb42a93';

-- 5. Check user roles (replace with actual user ID)
-- Get user ID from your profile when logged in as Course Creator
SELECT 
    id,
    name,
    email,
    roles
FROM profiles
WHERE email LIKE '%@inflite.nz%'  -- Adjust this to find your test users
ORDER BY name;

-- 6. FIX: Disable RLS on all relevant tables (if not already done)
-- Run these commands to fix the issue:
ALTER TABLE public.module_content_blocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_modules DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses DISABLE ROW LEVEL SECURITY;

-- 7. Verify RLS is disabled after running the fix
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename IN ('module_content_blocks', 'course_modules', 'courses')
ORDER BY tablename;