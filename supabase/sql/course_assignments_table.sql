-- Create course_assignments table for direct assignment system
CREATE TABLE IF NOT EXISTS public.course_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('trainee', 'onsite_trainer', 'onsite_assessor')) DEFAULT 'trainee',
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one user can have one assignment per course per role
  UNIQUE(user_id, course_id, role)
);

-- Add assignment_status column if it doesn't exist (for progress tracking)
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'assignment_status'
    ) THEN
        ALTER TABLE public.course_assignments 
        ADD COLUMN assignment_status TEXT DEFAULT 'assigned' CHECK (assignment_status IN ('assigned', 'in_progress', 'completed', 'expired'));
    END IF;
END $$;

-- Add completed_at column if it doesn't exist (for progress tracking)
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE public.course_assignments 
        ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_course_assignments_user_id ON public.course_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_course_assignments_course_id ON public.course_assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_course_assignments_role ON public.course_assignments(role);

-- Enable RLS
ALTER TABLE public.course_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "course_assignments_select" ON public.course_assignments;
CREATE POLICY "course_assignments_select"
ON public.course_assignments FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_assignments.course_id
        AND (
            c.created_by = auth.uid()
            OR public.app_has_role(auth.uid(), 'Admin')
            OR public.app_has_role(auth.uid(), 'Senior management')
        )
    )
);

DROP POLICY IF EXISTS "course_assignments_insert" ON public.course_assignments;
CREATE POLICY "course_assignments_insert"
ON public.course_assignments FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_assignments.course_id
        AND (
            c.created_by = auth.uid()
            OR public.app_has_role(auth.uid(), 'Admin')
            OR public.app_has_role(auth.uid(), 'Senior management')
        )
    )
);

DROP POLICY IF EXISTS "course_assignments_update" ON public.course_assignments;
CREATE POLICY "course_assignments_update"
ON public.course_assignments FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_assignments.course_id
        AND (
            c.created_by = auth.uid()
            OR public.app_has_role(auth.uid(), 'Admin')
            OR public.app_has_role(auth.uid(), 'Senior management')
        )
    )
);

DROP POLICY IF EXISTS "course_assignments_delete" ON public.course_assignments;
CREATE POLICY "course_assignments_delete"
ON public.course_assignments FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_assignments.course_id
        AND (
            c.created_by = auth.uid()
            OR public.app_has_role(auth.uid(), 'Admin')
            OR public.app_has_role(auth.uid(), 'Senior management')
        )
    )
);

-- Update function to handle updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS course_assignments_updated_at ON public.course_assignments;
CREATE TRIGGER course_assignments_updated_at
    BEFORE UPDATE ON public.course_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Add assignment_id column to learner_documents if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'learner_documents' 
        AND column_name = 'assignment_id'
    ) THEN
        ALTER TABLE public.learner_documents 
        ADD COLUMN assignment_id UUID REFERENCES public.course_assignments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create index for assignment_id in learner_documents
CREATE INDEX IF NOT EXISTS idx_learner_documents_assignment_id ON public.learner_documents(assignment_id);