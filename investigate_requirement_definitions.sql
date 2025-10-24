-- Investigation script for requirement_definitions view security issue
-- Run this FIRST in your Supabase SQL Editor (production database) to understand the current state

-- Step 1: Check if the view exists and get its current definition
SELECT 
    schemaname,
    viewname,
    viewowner,
    definition
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname = 'requirement_definitions';

-- Step 2: Check what permissions are currently granted on the view
SELECT 
    grantee,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' 
AND table_name = 'requirement_definitions';

-- Step 3: Check if the underlying table (onsite_requirements) has RLS enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'onsite_requirements';

-- Step 4: Check RLS policies on the underlying table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'onsite_requirements';

-- Step 5: Check if there are any dependencies on this view
SELECT 
    dependent_ns.nspname AS dependent_schema,
    dependent_view.relname AS dependent_view_name,
    source_ns.nspname AS source_schema,
    source_table.relname AS source_table_name
FROM pg_depend 
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid 
JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid 
JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid 
JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid 
JOIN pg_namespace source_ns ON source_table.relnamespace = source_ns.oid 
WHERE 
    source_ns.nspname = 'public' 
    AND source_table.relname = 'requirement_definitions'
    AND dependent_view.relname != 'requirement_definitions';

-- Step 6: Get the actual view definition in a more readable format
-- This will show you exactly what the view is doing
\d+ public.requirement_definitions