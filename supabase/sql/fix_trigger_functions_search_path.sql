
-- Fix all trigger functions with mutable search_path vulnerabilities
-- These are functions that automatically update timestamps on table modifications

-- 1. Fix update_assignment_progress_updated_at
CREATE OR REPLACE FUNCTION public.update_assignment_progress_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 2. Fix update_requirement_responses_updated_at  
CREATE OR REPLACE FUNCTION public.update_requirement_responses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 3. Fix update_updated_at_column (generic updated_at handler)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 4. Fix update_assignment_status_on_progress
CREATE OR REPLACE FUNCTION public.update_assignment_status_on_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Update assignment status based on progress
  IF NEW.progress_percentage >= 100 THEN
    NEW.assignment_status := 'completed';
    NEW.completed_at := now();
  ELSIF NEW.progress_percentage > 0 THEN
    NEW.assignment_status := 'in_progress';
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_assignment_progress_updated_at() IS 'Trigger function to update updated_at timestamp - Fixed search_path vulnerability';
COMMENT ON FUNCTION public.update_requirement_responses_updated_at() IS 'Trigger function to update updated_at timestamp - Fixed search_path vulnerability';
COMMENT ON FUNCTION public.update_updated_at_column() IS 'Generic trigger function to update updated_at timestamp - Fixed search_path vulnerability';
COMMENT ON FUNCTION public.update_assignment_status_on_progress() IS 'Trigger function to update assignment status based on progress - Fixed search_path vulnerability';
