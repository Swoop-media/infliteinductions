-- =========================================================
-- Setup Role-Based Authorization System
-- =========================================================
-- This script creates the necessary tables and roles for the 
-- authorization approval system
-- =========================================================

-- 1. Create profiles table (if not exists)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    department TEXT,
    job_description TEXT,
    microsoft_id TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_microsoft_id ON public.profiles(microsoft_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 2. Create roles table
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create user_roles junction table
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES auth.users(id),
    PRIMARY KEY (user_id, role_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);

-- 4. Insert the standard roles including the new Authorization Approver role
INSERT INTO public.roles (name, description) VALUES
    ('General', 'Basic user access'),
    ('Trainers and Assessors', 'Can conduct training and assessments'),
    ('Course Creators', 'Can create and manage courses'),
    ('Senior Management', 'Senior management oversight'),
    ('Admin', 'Full system administration'),
    ('Authorization Approver', 'Can approve pending authorizations')
ON CONFLICT (name) DO NOTHING;

-- 5. Create the has_role RPC function that the application uses
CREATE OR REPLACE FUNCTION public.has_role(uid UUID, role_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = uid 
        AND r.name = role_name
    );
END;
$$;

-- 6. Create v_profile_summary view for fetching user profiles with roles
CREATE OR REPLACE VIEW public.v_profile_summary AS
SELECT 
    p.id,
    p.full_name,
    p.email,
    p.department,
    p.job_description,
    p.microsoft_id,
    p.created_at,
    p.updated_at,
    COALESCE(
        array_agg(
            DISTINCT r.name ORDER BY r.name
        ) FILTER (WHERE r.name IS NOT NULL),
        ARRAY[]::text[]
    ) AS roles
FROM 
    public.profiles p
LEFT JOIN 
    public.user_roles ur ON ur.user_id = p.id
LEFT JOIN 
    public.roles r ON r.id = ur.role_id
GROUP BY 
    p.id, p.full_name, p.email, p.department, 
    p.job_description, p.microsoft_id, p.created_at, p.updated_at;

-- 7. Enable Row Level Security on tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS policies for profiles
CREATE POLICY "Users can view all profiles" 
    ON public.profiles FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Users can update own profile" 
    ON public.profiles FOR UPDATE 
    TO authenticated 
    USING (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles" 
    ON public.profiles 
    TO authenticated 
    USING (public.has_role(auth.uid(), 'Admin'))
    WITH CHECK (public.has_role(auth.uid(), 'Admin'));

-- 9. Create RLS policies for roles (read-only for most users)
CREATE POLICY "All users can view roles" 
    ON public.roles FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Only admins can manage roles" 
    ON public.roles 
    TO authenticated 
    USING (public.has_role(auth.uid(), 'Admin'))
    WITH CHECK (public.has_role(auth.uid(), 'Admin'));

-- 10. Create RLS policies for user_roles
CREATE POLICY "Users can view all role assignments" 
    ON public.user_roles FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Only admins can manage role assignments" 
    ON public.user_roles 
    TO authenticated 
    USING (public.has_role(auth.uid(), 'Admin'))
    WITH CHECK (public.has_role(auth.uid(), 'Admin'));

-- =========================================================
-- HOW TO USE THIS:
-- =========================================================
-- 1. Run this SQL script in your database
-- 2. To assign the "Authorization Approver" role to a user, run:
--
--    INSERT INTO public.user_roles (user_id, role_id, granted_by)
--    SELECT 
--        'USER_ID_HERE'::uuid,
--        id,
--        'YOUR_ADMIN_ID_HERE'::uuid
--    FROM public.roles
--    WHERE name = 'Authorization Approver';
--
-- 3. Update the authorization review page to check for this role:
--    Change line 316 in app/app/admin/review/[assignmentId]/page.tsx
--    FROM: const isSeniorManager = await hasRole("Senior Management");
--    TO:   const isApprover = await hasRole("Authorization Approver");
--
-- 4. To view which users have the Authorization Approver role:
--    SELECT 
--        p.full_name, 
--        p.email,
--        r.name as role_name
--    FROM public.user_roles ur
--    JOIN public.profiles p ON p.id = ur.user_id
--    JOIN public.roles r ON r.id = ur.role_id
--    WHERE r.name = 'Authorization Approver';
-- =========================================================