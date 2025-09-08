
-- Fix remaining functions with mutable search_path vulnerabilities

-- 1. Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Drop notify_enrolment_request function (it's deprecated and no longer used)
-- First drop any triggers that might reference it
DROP TRIGGER IF EXISTS enrolment_request_notification_trigger ON public.enrolments;
DROP TRIGGER IF EXISTS notify_enrolment_request_trigger ON public.enrolments;

-- Then drop the function itself
DROP FUNCTION IF EXISTS public.notify_enrolment_request();

-- Add comments for documentation
COMMENT ON FUNCTION public.update_updated_at_column() IS 'Trigger function to update updated_at column - Fixed search_path vulnerability';
