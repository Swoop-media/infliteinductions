
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

-- RLS Policies will be created by course_assignments_table.sql

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION public.update_assignment_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language plpgsql;

CREATE TRIGGER trg_assignment_progress_updated_at
    BEFORE UPDATE ON public.assignment_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.update_assignment_progress_updated_at();
