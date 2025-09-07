
-- Create learner_documents table for storing trainee uploaded documents
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one document per user per block
  UNIQUE(user_id, block_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_learner_documents_user_id ON public.learner_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_learner_documents_course_id ON public.learner_documents(course_id);
CREATE INDEX IF NOT EXISTS idx_learner_documents_module_id ON public.learner_documents(module_id);
CREATE INDEX IF NOT EXISTS idx_learner_documents_block_id ON public.learner_documents(block_id);

-- Enable RLS
ALTER TABLE public.learner_documents ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own documents
DROP POLICY IF EXISTS "learner_documents_own" ON public.learner_documents;
CREATE POLICY "learner_documents_own" 
ON public.learner_documents 
FOR ALL 
TO authenticated 
USING (user_id = auth.uid()) 
WITH CHECK (user_id = auth.uid());

-- Admins and course creators can read all documents
DROP POLICY IF EXISTS "learner_documents_admin_read" ON public.learner_documents;
CREATE POLICY "learner_documents_admin_read" 
ON public.learner_documents 
FOR SELECT 
TO authenticated 
USING (
  public.app_has_role(auth.uid(), 'Admin') OR
  public.app_has_role(auth.uid(), 'Senior management') OR
  EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = learner_documents.course_id
    AND c.created_by = auth.uid()
  )
);

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
