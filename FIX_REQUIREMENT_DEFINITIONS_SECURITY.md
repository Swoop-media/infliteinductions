# Fix for requirement_definitions View Security Issue

## Summary of the Security Issue

Supabase has detected that the `public.requirement_definitions` view is using `SECURITY DEFINER`, which can bypass Row-Level Security (RLS) and potentially expose data that users shouldn't see.

### Why This Is a Security Risk
- **SECURITY DEFINER** makes the view execute with the privileges of its owner (creator)
- This bypasses the calling user's RLS policies
- Users might see data they shouldn't have access to
- It complicates security auditing and violates the principle of least privilege

## Solution Steps

### Step 1: Investigate Current State (REQUIRED)

First, run the investigation script in your **Supabase SQL Editor** for the production database:

```sql
-- Copy and run the contents of investigate_requirement_definitions.sql
```

This will show you:
1. The current view definition
2. Current permissions
3. RLS status on underlying tables
4. Any dependencies

**IMPORTANT**: Save the output, especially the view definition!

### Step 2: Fix the Security Issue

After you have the current view definition from Step 1, follow these steps:

#### Option A: Quick Fix (Recommended)

Run this SQL in your Supabase SQL Editor:

```sql
BEGIN;

-- Get the current view definition first
SELECT definition FROM pg_views 
WHERE schemaname = 'public' AND viewname = 'requirement_definitions';

-- Copy the definition from above, then drop and recreate
DROP VIEW IF EXISTS public.requirement_definitions CASCADE;

-- Recreate with SECURITY INVOKER (paste the actual definition here)
CREATE VIEW public.requirement_definitions
WITH (security_invoker = on) AS
-- [PASTE THE ACTUAL VIEW DEFINITION HERE FROM STEP 1]
;

-- Restore permissions
GRANT SELECT ON public.requirement_definitions TO authenticated;

COMMIT;
```

#### Option B: If the View Doesn't Exist

If the investigation shows the view doesn't exist (which seems to be the case in development), it might have been:
1. Already fixed/removed
2. Only exists in production
3. Created outside of version control

In this case, you can either:
- Mark the alert as resolved in Supabase if the view is no longer needed
- Create the view properly if it's still needed

### Step 3: Verify the Fix

After applying the fix, verify:

```sql
-- Check that SECURITY DEFINER is removed
SELECT 
    viewname,
    CASE 
        WHEN definition ILIKE '%SECURITY DEFINER%' THEN 'STILL HAS SECURITY DEFINER - NOT FIXED!'
        ELSE 'SECURITY INVOKER - FIXED!'
    END as security_status
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname = 'requirement_definitions';

-- Test access with different roles
SET ROLE authenticated;
SELECT COUNT(*) FROM public.requirement_definitions;
RESET ROLE;
```

## Alternative: If You Actually Need SECURITY DEFINER

In rare cases where SECURITY DEFINER is actually required (e.g., for aggregating data users can't directly access), you must:

1. **Use a minimal-privilege owner**:
   ```sql
   -- Create a restricted role for the view
   CREATE ROLE view_owner_role WITH LOGIN PASSWORD 'secure_password';
   GRANT SELECT ON onsite_requirements TO view_owner_role;
   ALTER VIEW public.requirement_definitions OWNER TO view_owner_role;
   ```

2. **Set a secure search path**:
   ```sql
   ALTER VIEW public.requirement_definitions SET search_path = public, pg_catalog;
   ```

3. **Add explicit filtering** in the view definition to enforce security

4. **Document why** SECURITY DEFINER is needed

## Best Practices Going Forward

1. **Default to SECURITY INVOKER** for all views
2. **Enable RLS** on underlying tables
3. **Test with multiple user roles** before deploying
4. **Document security decisions** in code comments
5. **Regular security audits** using Supabase's lint tools

## What This Fix Does

- ✅ Respects user's RLS policies
- ✅ Prevents privilege escalation
- ✅ Maintains proper security boundaries
- ✅ Makes access control auditable
- ✅ Follows principle of least privilege

## Need Help?

If you encounter issues:
1. Check if the view has dependencies that also need updating
2. Ensure RLS policies exist on the `onsite_requirements` table
3. Test thoroughly with different user roles
4. Contact Supabase support if the alert persists after fixing

## Files Created

- `investigate_requirement_definitions.sql` - Run this first to understand current state
- `fix_requirement_definitions_view.sql` - Complete fix script with safety checks
- `FIX_REQUIREMENT_DEFINITIONS_SECURITY.md` - This documentation