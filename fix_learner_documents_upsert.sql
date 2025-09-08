
-- Fix upsert conflicts for learner_documents table
-- Run this after the first SQL file

-- Create or replace a function to handle document uploads with proper conflict resolution
CREATE OR REPLACE FUNCTION public.upsert_learner_document(
    p_user_id uuid,
    p_course_id uuid,
    p_module_id uuid,
    p_block_id uuid,
    p_title text,
    p_file_path text,
    p_file_size bigint DEFAULT NULL,
    p_file_type text DEFAULT NULL,
    p_expires_on date DEFAULT NULL,
    p_assignment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_document_id uuid;
BEGIN
    -- First, mark any existing document as replaced
    UPDATE public.learner_documents 
    SET status = 'replaced', updated_at = now()
    WHERE user_id = p_user_id 
    AND block_id = p_block_id 
    AND status != 'replaced';

    -- Insert the new document
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
        status,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_course_id,
        p_module_id,
        p_block_id,
        p_title,
        p_file_path,
        p_file_size,
        p_file_type,
        p_expires_on,
        p_assignment_id,
        'active',
        now(),
        now()
    )
    RETURNING id INTO v_document_id;

    RETURN v_document_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_learner_document TO authenticated;

COMMENT ON FUNCTION public.upsert_learner_document IS 'Safely upsert learner documents, handling conflicts by marking old documents as replaced';
