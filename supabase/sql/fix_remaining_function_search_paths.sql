
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

-- Drop all possible function signatures to ensure complete removal
DROP FUNCTION IF EXISTS public.notify_enrolment_request();
DROP FUNCTION IF EXISTS public.notify_enrolment_request(uuid);
DROP FUNCTION IF EXISTS public.notify_enrolment_request(text);
DROP FUNCTION IF EXISTS public.notify_enrolment_request(uuid, text);

-- Also check for any other potential trigger references
DROP TRIGGER IF EXISTS notify_enrolment_trigger ON public.enrolments;
DROP TRIGGER IF EXISTS enrolment_notify_trigger ON public.enrolments;

-- Add comments for documentation
COMMENT ON FUNCTION public.update_updated_at_column() IS 'Trigger function to update updated_at column - Fixed search_path vulnerability';
