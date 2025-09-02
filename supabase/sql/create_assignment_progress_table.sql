
-- Ensure course_assignments table has status and completed_at columns
ALTER TABLE public.course_assignments 
ADD COLUMN IF NOT EXISTS assignment_status TEXT DEFAULT 'assigned' CHECK (assignment_status IN ('assigned', 'in_progress', 'completed', 'expired'));

ALTER TABLE public.course_assignments 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Create assignment_progress table for tracking module completion in assignments
CREATE TABLE IF NOT EXISTS public.assignment_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.course_assignments(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint: one progress record per assignment per module
    UNIQUE(assignment_id, module_id)
);

-- Enable RLS
ALTER TABLE public.assignment_progress ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assignment_progress_assignment_id ON public.assignment_progress(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_progress_module_id ON public.assignment_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_assignment_progress_completed_at ON public.assignment_progress(completed_at);

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own assignment progress" ON public.assignment_progress;
DROP POLICY IF EXISTS "Users can insert their own assignment progress" ON public.assignment_progress;
DROP POLICY IF EXISTS "Users can update their own assignment progress" ON public.assignment_progress;
DROP POLICY IF EXISTS "Admins and creators can view all assignment progress" ON public.assignment_progress;
DROP POLICY IF EXISTS "Admins and creators can insert all assignment progress" ON public.assignment_progress;
DROP POLICY IF EXISTS "Admins and creators can update all assignment progress" ON public.assignment_progress;

-- RLS Policies for assignment_progress
-- Users can view their own progress
CREATE POLICY "Users can view their own assignment progress"
ON public.assignment_progress
FOR SELECT
USING (
    assignment_id IN (
        SELECT id FROM public.course_assignments 
        WHERE user_id = auth.uid()
    )
);

-- Users can insert their own progress
CREATE POLICY "Users can insert their own assignment progress"
ON public.assignment_progress
FOR INSERT
WITH CHECK (
    assignment_id IN (
        SELECT id FROM public.course_assignments 
        WHERE user_id = auth.uid()
    )
);

-- Users can update their own progress
CREATE POLICY "Users can update their own assignment progress"
ON public.assignment_progress
FOR UPDATE
USING (
    assignment_id IN (
        SELECT id FROM public.course_assignments 
        WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    assignment_id IN (
        SELECT id FROM public.course_assignments 
        WHERE user_id = auth.uid()
    )
);

-- Admins and course creators can view all assignment progress
CREATE POLICY "Admins and creators can view all assignment progress"
ON public.assignment_progress
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() 
        AND r.name IN ('Admin', 'Course Creators')
    )
);

-- Admins and course creators can insert assignment progress
CREATE POLICY "Admins and creators can insert all assignment progress"
ON public.assignment_progress
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() 
        AND r.name IN ('Admin', 'Course Creators')
    )
);

-- Admins and course creators can update assignment progress
CREATE POLICY "Admins and creators can update all assignment progress"
ON public.assignment_progress
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() 
        AND r.name IN ('Admin', 'Course Creators')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() 
        AND r.name IN ('Admin', 'Course Creators')
    )
);

-- Ensure the table has updated_at column
ALTER TABLE public.assignment_progress 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Create specific updated_at function for assignment_progress
CREATE OR REPLACE FUNCTION public.update_assignment_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at (only if it doesn't exist)
DROP TRIGGER IF EXISTS trg_assignment_progress_updated_at ON public.assignment_progress;
CREATE TRIGGER trg_assignment_progress_updated_at
    BEFORE UPDATE ON public.assignment_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.update_assignment_progress_updated_at();
