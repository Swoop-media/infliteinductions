
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

-- Complete removal of notify_enrolment_request function (no longer used with assignment system)
-- Drop all triggers that might reference the function
DROP TRIGGER IF EXISTS enrolment_insert_notify ON public.course_enrolments;
DROP TRIGGER IF EXISTS enrolment_insert_notify_alt ON public.enrolments;
DROP TRIGGER IF EXISTS notify_enrolment_trigger ON public.enrolments;
DROP TRIGGER IF EXISTS enrolment_notify_trigger ON public.enrolments;
DROP TRIGGER IF EXISTS enrolment_request_notification_trigger ON public.enrolments;
DROP TRIGGER IF EXISTS notify_enrolment_request_trigger ON public.enrolments;

-- Drop the trigger function
DROP FUNCTION IF EXISTS public.on_enrolment_insert_notify();

-- Use CASCADE to drop function and all dependent triggers at once
DROP FUNCTION IF EXISTS public.on_enrolment_insert_notify() CASCADE;

-- Drop all possible function signatures for notify_enrolment_request
DROP FUNCTION IF EXISTS public.notify_enrolment_request() CASCADE;
DROP FUNCTION IF EXISTS public.notify_enrolment_request(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.notify_enrolment_request(text) CASCADE;
DROP FUNCTION IF EXISTS public.notify_enrolment_request(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.notify_enrolment_request(uuid, uuid) CASCADE;

-- Clean up any RPC functions that might have similar signatures
DROP FUNCTION IF EXISTS public.notify_enrolment_request(p_user_id uuid, p_course_id uuid) CASCADE;

-- Add comments for documentation
COMMENT ON FUNCTION public.update_updated_at_column() IS 'Trigger function to update updated_at column - Fixed search_path vulnerability';
