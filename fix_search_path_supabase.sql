-- Fix Search Path Security Issues for Supabase
-- Run this SQL in your Supabase Dashboard: SQL Editor

-- 1. Fix upsert_learner_document function
CREATE OR REPLACE FUNCTION public.upsert_learner_document(
    p_user_id uuid, 
    p_course_id uuid, 
    p_module_id uuid, 
    p_block_id uuid, 
    p_title text, 
    p_file_path text, 
    p_file_size bigint, 
    p_file_type text, 
    p_expires_on text, 
    p_assignment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_catalog  -- This line fixes the security warning
AS $function$
DECLARE
    v_document_id UUID;
    v_course_title VARCHAR(255);
    v_module_title VARCHAR(255);
    v_expires_timestamp TIMESTAMP;
BEGIN
    -- Convert text to timestamp if not null
    IF p_expires_on IS NOT NULL AND p_expires_on != '' THEN
        v_expires_timestamp := p_expires_on::timestamp;
    ELSE
        v_expires_timestamp := NULL;
    END IF;
    
    -- Get course and module titles
    SELECT title INTO v_course_title FROM public.courses WHERE id = p_course_id;
    SELECT title INTO v_module_title FROM public.course_modules WHERE id = p_module_id;
    
    -- Check if a document already exists for this user/module/block combination
    -- For onsite requirements (NULL block_id), we match on NULL block_id
    SELECT id INTO v_document_id
    FROM public.learner_documents
    WHERE user_id = p_user_id 
      AND module_id = p_module_id 
      AND ((p_block_id IS NULL AND block_id IS NULL) OR (p_block_id IS NOT NULL AND block_id = p_block_id));
    
    IF v_document_id IS NOT NULL THEN
        -- Update existing document
        UPDATE public.learner_documents
        SET 
            title = p_title,
            file_path = p_file_path,
            file_size = p_file_size,
            file_type = p_file_type,
            expires_on = v_expires_timestamp,
            course_title = v_course_title,
            module_title = v_module_title,
            updated_at = NOW()
        WHERE id = v_document_id;
    ELSE
        -- Insert new document with block_id as NULL for onsite requirements
        INSERT INTO public.learner_documents (
            user_id,
            course_id,
            module_id,
            block_id,
            title,
            file_path,
            file_size,
            file_type,
            expires_on,
            assignment_id,
            course_title,
            module_title,
            created_at
        ) VALUES (
            p_user_id,
            p_course_id,
            p_module_id,
            p_block_id,  -- Keep NULL if it's NULL (for onsite requirements)
            p_title,
            p_file_path,
            p_file_size,
            p_file_type,
            v_expires_timestamp,
            p_assignment_id,
            v_course_title,
            v_module_title,
            NOW()
        )
        RETURNING id INTO v_document_id;
    END IF;
    
    RETURN v_document_id;
END;
$function$;

-- If you have other functions with the same warning, add them below:

-- 2. Fix get_course_meta function (if it shows a warning)
CREATE OR REPLACE FUNCTION public.get_course_meta(p_course_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog  -- This line fixes the security warning
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'course', (SELECT row_to_json(c) FROM public.courses c WHERE c.id = p_course_id),
    'modules', COALESCE((SELECT json_agg(m) FROM public.course_modules m WHERE m.course_id = p_course_id ORDER BY m.order_index), '[]'::json),
    'requirements', COALESCE((SELECT json_agg(r) FROM public.onsite_requirements r WHERE r.module_id IN (SELECT id FROM public.course_modules WHERE course_id = p_course_id)), '[]'::json)
  ) INTO result;
  
  RETURN result;
END;
$function$;

-- 3. Fix save_learner_document function (if it shows a warning)
CREATE OR REPLACE FUNCTION public.save_learner_document(
    p_user_id uuid, 
    p_course_id uuid, 
    p_module_id uuid, 
    p_block_id uuid, 
    p_title character varying, 
    p_file_path text, 
    p_file_size bigint, 
    p_file_type character varying, 
    p_expires_on text, 
    p_assignment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog  -- This line fixes the security warning
AS $function$
DECLARE
    v_document_id UUID;
    v_course_title VARCHAR(255);
    v_module_title VARCHAR(255);
    v_expires_timestamp TIMESTAMP;
BEGIN
    -- Convert text to timestamp if not null
    IF p_expires_on IS NOT NULL AND p_expires_on != '' THEN
        v_expires_timestamp := p_expires_on::timestamp;
    ELSE
        v_expires_timestamp := NULL;
    END IF;
    
    -- Get course and module titles
    SELECT title INTO v_course_title FROM public.courses WHERE id = p_course_id;
    SELECT title INTO v_module_title FROM public.course_modules WHERE id = p_module_id;
    
    -- Check if a document already exists for this user/module/block combination
    IF p_block_id IS NOT NULL THEN
        SELECT id INTO v_document_id
        FROM public.learner_documents
        WHERE user_id = p_user_id 
          AND module_id = p_module_id 
          AND block_id = p_block_id;
    END IF;
    
    IF v_document_id IS NOT NULL THEN
        -- Update existing document
        UPDATE public.learner_documents
        SET 
            title = p_title,
            file_path = p_file_path,
            file_size = p_file_size,
            file_type = p_file_type,
            expires_on = v_expires_timestamp,
            course_title = v_course_title,
            module_title = v_module_title,
            updated_at = NOW()
        WHERE id = v_document_id;
    ELSE
        -- Insert new document
        INSERT INTO public.learner_documents (
            user_id,
            course_id,
            module_id,
            block_id,
            title,
            file_path,
            file_size,
            file_type,
            expires_on,
            assignment_id,
            course_title,
            module_title,
            created_at
        ) VALUES (
            p_user_id,
            p_course_id,
            p_module_id,
            p_block_id,
            p_title,
            p_file_path,
            p_file_size,
            p_file_type,
            v_expires_timestamp,
            p_assignment_id,
            v_course_title,
            v_module_title,
            NOW()
        )
        RETURNING id INTO v_document_id;
    END IF;
    
    RETURN v_document_id;
END;
$function$;

-- 4. Fix trigger_check_authorization_on_course_complete function (if it shows a warning)
CREATE OR REPLACE FUNCTION public.trigger_check_authorization_on_course_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog  -- This line fixes the security warning
AS $function$
BEGIN
    -- Only check if the status changed to 'completed'
    IF NEW.assignment_status = 'completed' AND 
       (OLD.assignment_status IS NULL OR OLD.assignment_status != 'completed') AND
       NEW.role = 'trainee' THEN
        
        -- First try the normal flow
        PERFORM public.check_authorization_completion(NEW.user_id, NEW.course_id);
        
        -- Also check all authorizations for this user (handles missing links)
        PERFORM public.check_all_user_authorizations(NEW.user_id);
    END IF;
    
    RETURN NEW;
END;
$function$;