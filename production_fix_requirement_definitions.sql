-- Production Fix for requirement_definitions View Security Issue
-- Run this in your Supabase Dashboard > SQL Editor on the PRODUCTION database

-- ============================================
-- STEP 1: BACKUP CURRENT VIEW DEFINITION
-- ============================================
-- Run this first and SAVE THE OUTPUT!
DO $$
DECLARE
    current_definition TEXT;
    current_owner TEXT;
BEGIN
    SELECT definition, viewowner 
    INTO current_definition, current_owner
    FROM pg_views 
    WHERE schemaname = 'public' 
    AND viewname = 'requirement_definitions';
    
    IF current_definition IS NOT NULL THEN
        RAISE NOTICE E'\n=== CURRENT VIEW DEFINITION (SAVE THIS!) ===\n%\n=== Owner: % ===\n', current_definition, current_owner;
    ELSE
        RAISE NOTICE 'View requirement_definitions not found in public schema';
        RAISE NOTICE 'The security alert may be outdated or the view may have been removed';
    END IF;
END $$;

-- ============================================
-- STEP 2: APPLY THE FIX (Run in a transaction)
-- ============================================
BEGIN;

-- Check if view exists before trying to fix it
DO $$
DECLARE
    view_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_views 
        WHERE schemaname = 'public' 
        AND viewname = 'requirement_definitions'
    ) INTO view_exists;
    
    IF NOT view_exists THEN
        RAISE EXCEPTION 'View requirement_definitions does not exist. The alert may be outdated.';
    END IF;
END $$;

-- Store the current view definition in a temporary function
-- This preserves the exact logic while we recreate it
CREATE OR REPLACE FUNCTION temp_store_view_def() 
RETURNS TEXT AS $$
DECLARE
    def TEXT;
BEGIN
    SELECT definition INTO def
    FROM pg_views 
    WHERE schemaname = 'public' 
    AND viewname = 'requirement_definitions';
    RETURN def;
END;
$$ LANGUAGE plpgsql;

-- Get current permissions before dropping
CREATE TEMP TABLE temp_view_permissions AS
SELECT 
    grantee,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' 
AND table_name = 'requirement_definitions';

-- Drop the view with CASCADE to handle dependencies
DROP VIEW IF EXISTS public.requirement_definitions CASCADE;

-- Recreate the view with SECURITY INVOKER
-- Based on the codebase analysis, this view likely shows onsite_requirements data
CREATE VIEW public.requirement_definitions
WITH (security_invoker = on) AS
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
ORDER BY order_index;

-- Note: If the above CREATE VIEW fails because the structure is different,
-- use the definition you saved from STEP 1 and modify it:
-- 1. Remove any "SECURITY DEFINER" clause
-- 2. Add "WITH (security_invoker = on)" after the view name
-- 3. Keep the rest of the SELECT statement as is

-- Restore original permissions
DO $$
DECLARE
    perm RECORD;
BEGIN
    FOR perm IN SELECT * FROM temp_view_permissions
    LOOP
        EXECUTE format('GRANT %s ON public.requirement_definitions TO %I', 
                      perm.privilege_type, perm.grantee);
    END LOOP;
END $$;

-- Clean up temporary objects
DROP FUNCTION IF EXISTS temp_store_view_def();
DROP TABLE IF EXISTS temp_view_permissions;

-- Verify the fix was applied
DO $$
DECLARE
    new_definition TEXT;
    has_security_definer BOOLEAN;
BEGIN
    SELECT definition INTO new_definition
    FROM pg_views 
    WHERE schemaname = 'public' 
    AND viewname = 'requirement_definitions';
    
    -- Check if SECURITY DEFINER still exists in the definition
    has_security_definer := new_definition ILIKE '%SECURITY DEFINER%';
    
    IF new_definition IS NOT NULL THEN
        IF has_security_definer THEN
            RAISE EXCEPTION 'SECURITY DEFINER still present! Fix failed.';
        ELSE
            RAISE NOTICE 'SUCCESS: View recreated with SECURITY INVOKER (safe mode)';
        END IF;
    ELSE
        RAISE EXCEPTION 'View recreation failed';
    END IF;
END $$;

COMMIT;

-- ============================================
-- STEP 3: VERIFY THE FIX
-- ============================================

-- Check final state
SELECT 
    'requirement_definitions' as view_name,
    CASE 
        WHEN definition ILIKE '%SECURITY DEFINER%' THEN '❌ STILL HAS SECURITY DEFINER'
        ELSE '✅ FIXED - Using SECURITY INVOKER'
    END as security_status,
    viewowner as owner
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname = 'requirement_definitions';

-- Check permissions
SELECT 
    grantee as "Role",
    string_agg(privilege_type, ', ') as "Permissions"
FROM information_schema.table_privileges
WHERE table_schema = 'public' 
AND table_name = 'requirement_definitions'
GROUP BY grantee
ORDER BY grantee;

-- ============================================
-- STEP 4: TEST WITH DIFFERENT ROLES (Optional)
-- ============================================
-- Uncomment and run these separately to verify RLS is working:

-- -- Test as authenticated user
-- SET ROLE authenticated;
-- SELECT COUNT(*) as visible_rows FROM public.requirement_definitions;
-- RESET ROLE;

-- -- Test as anon user (should likely see nothing or error)
-- SET ROLE anon;
-- SELECT COUNT(*) as visible_rows FROM public.requirement_definitions;
-- RESET ROLE;

-- ============================================
-- ROLLBACK SCRIPT (If something goes wrong)
-- ============================================
-- If you need to rollback, use the view definition you saved from STEP 1:
-- 
-- DROP VIEW IF EXISTS public.requirement_definitions CASCADE;
-- CREATE VIEW public.requirement_definitions AS
-- [PASTE YOUR ORIGINAL DEFINITION HERE];
-- 
-- Then restore the original permissions.