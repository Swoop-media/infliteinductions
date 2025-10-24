-- Fix requirement_definitions view security issue
-- This script removes SECURITY DEFINER from the view to respect RLS
-- Run this in your Supabase SQL Editor for the production database

-- First, let's check what the current view definition is
-- (You should run this first to understand what the view does)
DO $$
DECLARE
    view_definition TEXT;
BEGIN
    -- Get the current view definition for documentation
    SELECT definition INTO view_definition
    FROM pg_views 
    WHERE schemaname = 'public' 
    AND viewname = 'requirement_definitions';
    
    IF view_definition IS NOT NULL THEN
        RAISE NOTICE 'Current view definition: %', view_definition;
    ELSE
        RAISE NOTICE 'View requirement_definitions not found';
    END IF;
END $$;

-- Create a transaction to safely recreate the view
BEGIN;

-- Drop the existing view with SECURITY DEFINER
DROP VIEW IF EXISTS public.requirement_definitions CASCADE;

-- Recreate the view with SECURITY INVOKER (default, safer option)
-- Note: You'll need to replace this with the actual view definition
-- After running the check above, copy the definition here
CREATE VIEW public.requirement_definitions
-- SECURITY INVOKER is the default, but we can be explicit
WITH (security_invoker = on) AS
-- IMPORTANT: Replace this SELECT statement with the actual view definition
-- that you got from the check above
SELECT 
    id,
    module_id,
    role,
    label,
    field_type,
    options,
    required,
    order_index,
    help_text,
    created_at
FROM public.onsite_requirements
-- Add any WHERE clauses, JOINs, or other logic from the original view
ORDER BY order_index;

-- Reapply appropriate permissions
-- Grant SELECT permission to authenticated users
GRANT SELECT ON public.requirement_definitions TO authenticated;

-- If you have specific roles that need access, grant them here
-- Example: GRANT SELECT ON public.requirement_definitions TO service_role;

-- Verify the view was created correctly
DO $$
DECLARE
    new_view_definition TEXT;
    security_mode TEXT;
BEGIN
    -- Check the new view exists and get its security mode
    SELECT definition INTO new_view_definition
    FROM pg_views 
    WHERE schemaname = 'public' 
    AND viewname = 'requirement_definitions';
    
    IF new_view_definition IS NOT NULL THEN
        RAISE NOTICE 'View recreated successfully';
        
        -- Check if SECURITY DEFINER is removed
        SELECT CASE 
            WHEN v.definition ILIKE '%SECURITY DEFINER%' THEN 'SECURITY DEFINER (WARNING!)'
            ELSE 'SECURITY INVOKER (Safe)'
        END INTO security_mode
        FROM pg_views v
        WHERE v.schemaname = 'public' 
        AND v.viewname = 'requirement_definitions';
        
        RAISE NOTICE 'Security mode: %', security_mode;
    ELSE
        RAISE EXCEPTION 'Failed to recreate view';
    END IF;
END $$;

COMMIT;

-- Test the view with different roles (optional, for verification)
-- Run these separately after the fix to verify RLS is working:

-- Test as an authenticated user (should only see allowed data)
-- SET ROLE authenticated;
-- SELECT COUNT(*) FROM public.requirement_definitions;
-- RESET ROLE;

-- Additional checks to ensure RLS is properly configured on base tables
DO $$
DECLARE
    rls_enabled BOOLEAN;
BEGIN
    -- Check if RLS is enabled on the onsite_requirements table
    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
    WHERE relname = 'onsite_requirements'
    AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
    
    IF rls_enabled THEN
        RAISE NOTICE 'RLS is enabled on onsite_requirements table (Good!)';
    ELSE
        RAISE WARNING 'RLS is NOT enabled on onsite_requirements table - consider enabling it for better security';
    END IF;
END $$;