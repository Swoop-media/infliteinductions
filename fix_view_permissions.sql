-- Fix excessive permissions on requirement_definitions view
-- Views should only have SELECT permissions, not INSERT/UPDATE/DELETE

-- Run this in your Supabase SQL Editor (Production)

BEGIN;

-- Revoke all existing permissions from all roles
REVOKE ALL ON public.requirement_definitions FROM anon;
REVOKE ALL ON public.requirement_definitions FROM authenticated;
REVOKE ALL ON public.requirement_definitions FROM service_role;
-- Keep postgres as owner with full permissions

-- Grant only SELECT permissions as appropriate for a view
GRANT SELECT ON public.requirement_definitions TO authenticated;
-- Only grant to anon if you want unauthenticated users to see this data
-- GRANT SELECT ON public.requirement_definitions TO anon;

-- Service role gets SELECT (it already has broader permissions via its role)
GRANT SELECT ON public.requirement_definitions TO service_role;

COMMIT;

-- Verify the permissions are now correct
SELECT 
    grantee as "Role",
    string_agg(privilege_type, ', ') as "Permissions"
FROM information_schema.table_privileges
WHERE table_schema = 'public' 
AND table_name = 'requirement_definitions'
GROUP BY grantee
ORDER BY grantee;

-- Also verify the security status one more time
SELECT 
    'requirement_definitions' as view_name,
    CASE 
        WHEN definition ILIKE '%SECURITY DEFINER%' THEN '❌ STILL HAS SECURITY DEFINER'
        ELSE '✅ FIXED - Using SECURITY INVOKER'
    END as security_status
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname = 'requirement_definitions';