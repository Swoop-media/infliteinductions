-- =====================================================
-- PRODUCTION DATABASE FIXES FOR DOCUMENT UPLOAD ERRORS
-- =====================================================
-- Run these commands in your Supabase SQL Editor
-- These fix the two critical errors from your production logs

-- =====================================================
-- FIX 1: Update course_assignments table
-- Fixes: "null value in column 'created_by' violates not-null constraint"
-- =====================================================

-- Step 1: Check and rename assigned_by to created_by if needed
DO $$ 
BEGIN 
    -- If created_by column doesn't exist but assigned_by does, rename it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'created_by'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'assigned_by'
    ) THEN
        ALTER TABLE public.course_assignments 
        RENAME COLUMN assigned_by TO created_by;
        
        RAISE NOTICE 'Renamed assigned_by to created_by in course_assignments table';
    END IF;
END $$;

-- Step 2: Ensure created_by is NOT NULL (backfill any NULLs first)
DO $$ 
BEGIN 
    -- Check if the column allows NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'created_by'
        AND is_nullable = 'YES'
    ) THEN
        -- First backfill any NULL values with the first admin user
        UPDATE public.course_assignments 
        SET created_by = (
            SELECT id FROM auth.users 
            WHERE id IN (
                SELECT user_id FROM public.user_roles 
                WHERE role_id IN (
                    SELECT id FROM public.roles WHERE name = 'Admin'
                )
            ) 
            LIMIT 1
        )
        WHERE created_by IS NULL;
        
        -- Now make it NOT NULL
        ALTER TABLE public.course_assignments 
        ALTER COLUMN created_by SET NOT NULL;
        
        RAISE NOTICE 'Set created_by column to NOT NULL';
    END IF;
END $$;

-- =====================================================
-- FIX 2: Update upsert_learner_document function
-- Fixes: "null value in column 'block_id' violates not-null constraint"
-- =====================================================

CREATE OR REPLACE FUNCTION upsert_learner_document(
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
    v_effective_block_id UUID;
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
    
    -- Handle NULL block_id for onsite requirements
    -- If block_id is NULL (like for onsite requirements), use the module_id as a placeholder
    -- This prevents the NOT NULL constraint violation
    v_effective_block_id := COALESCE(p_block_id, p_module_id);
    
    -- Check if a document already exists for this user/module/block combination
    SELECT id INTO v_document_id
    FROM public.learner_documents
    WHERE user_id = p_user_id 
      AND module_id = p_module_id 
      AND (
          (p_block_id IS NOT NULL AND block_id = p_block_id) OR 
          (p_block_id IS NULL AND block_id = p_module_id)
      );
    
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
            v_effective_block_id,  -- Use the effective block_id (module_id if NULL)
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

-- =====================================================
-- FIX 3: Update auto_assign_authorization_courses trigger
-- This ensures the trigger uses the correct column name
-- =====================================================

CREATE OR REPLACE FUNCTION auto_assign_authorization_courses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    course_record RECORD;
BEGIN
    -- Only process when a new authorization assignment is created
    IF TG_OP = 'INSERT' THEN
        -- Get all courses in this authorization
        FOR course_record IN
            SELECT ac.course_id
            FROM authorisation_courses ac
            WHERE ac.authorisation_id = NEW.authorisation_id
        LOOP
            -- Insert course assignment for this user as trainee (ignore if already exists)
            INSERT INTO course_assignments (
                user_id,
                course_id,
                role,
                created_by,  -- Changed from assigned_by to created_by
                assignment_status,
                created_at
            ) VALUES (
                NEW.user_id,
                course_record.course_id,
                'trainee',
                COALESCE(NEW.created_by, NEW.assigned_by, NEW.user_id),  -- Handle both column names and fallback to user_id
                'assigned',
                NOW()
            )
            ON CONFLICT (course_id, user_id, role) DO NOTHING;
            
            RAISE LOG 'Auto-assigned user % as trainee to course % via authorization %', 
                NEW.user_id, course_record.course_id, NEW.authorisation_id;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$;

-- =====================================================
-- VERIFICATION: Check that fixes were applied
-- =====================================================

-- Verify course_assignments has created_by column
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'course_assignments' 
  AND column_name = 'created_by';

-- Verify the functions were updated
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_type = 'FUNCTION' 
  AND routine_schema = 'public'
  AND routine_name IN ('upsert_learner_document', 'auto_assign_authorization_courses');