
-- Fix learner_documents table to include all required columns
-- Run this SQL in your Supabase SQL editor

-- First, let's ensure the table exists with proper structure
CREATE TABLE IF NOT EXISTS public.learner_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.module_content_blocks(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_path text NOT NULL,
  expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add missing columns if they don't exist
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
        ADD COLUMN status text DEFAULT 'active';
    END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_learner_documents_assignment_id ON public.learner_documents(assignment_id);
CREATE INDEX IF NOT EXISTS idx_learner_documents_status ON public.learner_documents(status);
CREATE INDEX IF NOT EXISTS idx_learner_documents_user_id ON public.learner_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_learner_documents_course_id ON public.learner_documents(course_id);
CREATE INDEX IF NOT EXISTS idx_learner_documents_module_id ON public.learner_documents(module_id);
CREATE INDEX IF NOT EXISTS idx_learner_documents_block_id ON public.learner_documents(block_id);

-- Update the unique constraint to be more flexible
-- Drop the existing constraint if it exists
ALTER TABLE public.learner_documents DROP CONSTRAINT IF EXISTS learner_documents_user_id_block_id_key;

-- Add a new unique constraint that allows multiple documents per user/block but only one active at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_learner_documents_unique_active 
ON public.learner_documents(user_id, block_id) 
WHERE status = 'active';

-- Enable RLS
ALTER TABLE public.learner_documents ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT ALL ON public.learner_documents TO authenticated;

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

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_learner_documents_updated_at ON public.learner_documents;
CREATE TRIGGER update_learner_documents_updated_at
    BEFORE UPDATE ON public.learner_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.learner_documents IS 'Stores documents uploaded by learners for course modules';
