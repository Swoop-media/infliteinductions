
-- Fix learner_documents table to include all required columns
-- Run this SQL in your Supabase SQL editor

-- First, let's ensure the table has all required columns
DO $$ 
BEGIN 
    -- Add assignment_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'learner_documents' 
        AND column_name = 'assignment_id'
    ) THEN
        ALTER TABLE public.learner_documents 
        ADD COLUMN assignment_id uuid REFERENCES public.course_assignments(id) ON DELETE CASCADE;
    END IF;

    -- Add file_size column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'learner_documents' 
        AND column_name = 'file_size'
    ) THEN
        ALTER TABLE public.learner_documents 
        ADD COLUMN file_size bigint;
    END IF;

    -- Add file_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'learner_documents' 
        AND column_name = 'file_type'
    ) THEN
        ALTER TABLE public.learner_documents 
        ADD COLUMN file_type text;
    END IF;

    -- Add status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'learner_documents' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE public.learner_documents 
        ADD COLUMN status text DEFAULT 'pending';
    END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_learner_documents_assignment_id ON public.learner_documents(assignment_id);
CREATE INDEX IF NOT EXISTS idx_learner_documents_status ON public.learner_documents(status);

-- Update the unique constraint to be more flexible
-- Drop the existing constraint if it exists
ALTER TABLE public.learner_documents DROP CONSTRAINT IF EXISTS learner_documents_user_id_block_id_key;

-- Add a new unique constraint that allows multiple documents per user/block but only one active at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_learner_documents_unique_active 
ON public.learner_documents(user_id, block_id) 
WHERE status != 'replaced';

-- Grant necessary permissions
GRANT ALL ON public.learner_documents TO authenticated;
GRANT USAGE ON SEQUENCE learner_documents_id_seq TO authenticated;

-- Update RLS policies to be more permissive for document uploads
DROP POLICY IF EXISTS "learner_documents_own" ON public.learner_documents;
CREATE POLICY "learner_documents_own" 
ON public.learner_documents 
FOR ALL 
TO authenticated 
USING (user_id = auth.uid()) 
WITH CHECK (user_id = auth.uid());

-- Allow service role to manage documents
DROP POLICY IF EXISTS "learner_documents_service_role" ON public.learner_documents;
CREATE POLICY "learner_documents_service_role" 
ON public.learner_documents 
FOR ALL 
TO service_role;

COMMENT ON TABLE public.learner_documents IS 'Stores documents uploaded by learners for course modules';
