
-- Add approval tracking columns
ALTER TABLE public.authorisation_assignments 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.authorisation_assignments 
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_authorisation_assignments_approved_at ON public.authorisation_assignments(approved_at);
CREATE INDEX IF NOT EXISTS idx_authorisation_assignments_approved_by ON public.authorisation_assignments(approved_by);
