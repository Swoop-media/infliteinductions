-- =====================================================
-- FIX FOR ONSITE MODULE DOCUMENT UPLOAD ERROR
-- =====================================================
-- This fixes the "null value in column block_id violates not-null constraint" error
-- when uploading documents for onsite training/assessment modules

-- Step 1: Make sure block_id column allows NULL values (for onsite modules)
ALTER TABLE public.learner_documents 
ALTER COLUMN block_id DROP NOT NULL;

-- Step 2: Drop and recreate the function with proper NULL handling
DROP FUNCTION IF EXISTS public.upsert_learner_document(
    uuid, uuid, uuid, uuid, text, text, bigint, text, text, uuid
);

-- Step 3: Create the corrected function
CREATE OR REPLACE FUNCTION public.upsert_learner_document(
    p_user_id UUID,
    p_course_id UUID,
    p_module_id UUID,
    p_block_id UUID,
    p_title TEXT,
    p_file_path TEXT,
    p_file_size BIGINT,
    p_file_type TEXT,
    p_expires_on TEXT,
    p_assignment_id UUID
) RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql;

-- Step 4: Verify the fix
SELECT 
    column_name,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'learner_documents' 
    AND column_name = 'block_id';

-- Expected result: is_nullable should be 'YES'