
-- Add columns to support admin-created users
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS created_via_admin BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS awaiting_first_login BOOLEAN DEFAULT FALSE;

-- Create authorization assignments table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.authorisation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authorisation_id UUID NOT NULL REFERENCES public.authorisations(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one user can have one assignment per authorization
  UNIQUE(user_id, authorisation_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_authorisation_assignments_user_id ON public.authorisation_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_authorisation_assignments_auth_id ON public.authorisation_assignments(authorisation_id);

-- Enable RLS
ALTER TABLE public.authorisation_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authorization assignments
CREATE POLICY "authorisation_assignments_select"
ON public.authorisation_assignments FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.authorisations a
        WHERE a.id = authorisation_assignments.authorisation_id
        AND (
            a.created_by = auth.uid()
            OR public.app_has_role(auth.uid(), 'Admin')
            OR public.app_has_role(auth.uid(), 'Senior management')
        )
    )
);

CREATE POLICY "authorisation_assignments_insert"
ON public.authorisation_assignments FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.authorisations a
        WHERE a.id = authorisation_assignments.authorisation_id
        AND (
            a.created_by = auth.uid()
            OR public.app_has_role(auth.uid(), 'Admin')
            OR public.app_has_role(auth.uid(), 'Senior management')
        )
    )
);

CREATE POLICY "authorisation_assignments_update"
ON public.authorisation_assignments FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.authorisations a
        WHERE a.id = authorisation_assignments.authorisation_id
        AND (
            a.created_by = auth.uid()
            OR public.app_has_role(auth.uid(), 'Admin')
            OR public.app_has_role(auth.uid(), 'Senior management')
        )
    )
);

CREATE POLICY "authorisation_assignments_delete"
ON public.authorisation_assignments FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.authorisations a
        WHERE a.id = authorisation_assignments.authorisation_id
        AND (
            a.created_by = auth.uid()
            OR public.app_has_role(auth.uid(), 'Admin')
            OR public.app_has_role(auth.uid(), 'Senior management')
        )
    )
);

-- Function to link admin-created users on first login
CREATE OR REPLACE FUNCTION public.link_admin_created_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if there's a profile waiting for this email
    UPDATE public.profiles 
    SET 
        id = NEW.id,
        awaiting_first_login = FALSE,
        updated_at = NOW()
    WHERE 
        email = NEW.email 
        AND created_via_admin = TRUE 
        AND awaiting_first_login = TRUE;
    
    -- If we updated a row, also update all related assignments
    IF FOUND THEN
        -- Update course assignments
        UPDATE public.course_assignments 
        SET user_id = NEW.id 
        WHERE user_id IN (
            SELECT id FROM public.profiles 
            WHERE email = NEW.email 
            AND created_via_admin = TRUE
        );
        
        -- Update authorization assignments
        UPDATE public.authorisation_assignments 
        SET user_id = NEW.id 
        WHERE user_id IN (
            SELECT id FROM public.profiles 
            WHERE email = NEW.email 
            AND created_via_admin = TRUE
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to run this function when a user signs in for the first time
DROP TRIGGER IF EXISTS on_auth_user_created_link_admin_user ON auth.users;
CREATE TRIGGER on_auth_user_created_link_admin_user
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.link_admin_created_user();
