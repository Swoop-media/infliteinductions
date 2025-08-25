
-- Check if teams_users table exists and either enable RLS or drop it
-- This addresses the security alert while preserving notification functionality

-- First, check if the table exists and has any important data
-- If teams_users exists but is empty/unused, we'll drop it
-- If it has data, we'll enable RLS with appropriate policies

DO $$
BEGIN
  -- Check if teams_users table exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'teams_users') THEN
    
    -- Check if it has any data
    IF (SELECT COUNT(*) FROM public.teams_users) = 0 THEN
      -- Table is empty, safe to drop
      DROP TABLE IF EXISTS public.teams_users CASCADE;
      RAISE NOTICE 'Dropped empty teams_users table';
    ELSE
      -- Table has data, enable RLS and add policies
      ALTER TABLE public.teams_users ENABLE ROW LEVEL SECURITY;
      
      -- Add basic policies (adjust based on your needs)
      CREATE POLICY "Service role can manage teams_users" ON public.teams_users
        FOR ALL USING (auth.role() = 'service_role');
        
      CREATE POLICY "Users can view own teams_users records" ON public.teams_users
        FOR SELECT USING (user_id = auth.uid());
        
      RAISE NOTICE 'Enabled RLS on teams_users table with policies';
    END IF;
  ELSE
    RAISE NOTICE 'teams_users table does not exist - no action needed';
  END IF;
END
$$;

-- Verify our main Teams tables still have proper RLS
-- This ensures notifications continue working

-- Ensure teams_links has RLS enabled
ALTER TABLE public.teams_links ENABLE ROW LEVEL SECURITY;

-- Ensure teams_link_codes has RLS enabled  
ALTER TABLE public.teams_link_codes ENABLE ROW LEVEL SECURITY;

-- Verify/recreate policies for teams_links if they don't exist
DO $$
BEGIN
  -- Check if policies exist, if not recreate them
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'teams_links' AND policyname = 'Users can view own teams links') THEN
    CREATE POLICY "Users can view own teams links" ON public.teams_links
      FOR SELECT USING (user_id = auth.uid());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'teams_links' AND policyname = 'Service role can manage teams links') THEN
    CREATE POLICY "Service role can manage teams links" ON public.teams_links
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END
$$;

-- Verify/recreate policies for teams_link_codes if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'teams_link_codes' AND policyname = 'Users can manage own link codes') THEN
    CREATE POLICY "Users can manage own link codes" ON public.teams_link_codes
      FOR ALL USING (user_id = auth.uid());
  END IF;
END
$$;

-- Grant necessary permissions to ensure notifications keep working
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.teams_links TO service_role;
GRANT ALL ON public.teams_link_codes TO service_role;
GRANT SELECT ON public.teams_links TO authenticated;
GRANT ALL ON public.teams_link_codes TO authenticated;
