-- Step 1: First, check the current constraint definition
-- Run this to see what the constraint currently allows:
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as current_constraint
FROM pg_constraint 
WHERE conrelid = 'public.roles'::regclass 
AND contype = 'c';

-- Step 2: Drop the existing constraint
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_check;

-- Step 3: Add a new constraint that includes the Authorization Approver role
ALTER TABLE public.roles 
ADD CONSTRAINT roles_name_check 
CHECK (name IN (
    'General',
    'Trainers and Assessors',
    'Course Creators', 
    'Senior Management',
    'Admin',
    'Authorization Approver'
));

-- Step 4: Now insert the new role
INSERT INTO public.roles (id, name, description)
VALUES (
    gen_random_uuid(),
    'Authorization Approver',
    'Can approve pending authorizations'
)
ON CONFLICT (name) DO NOTHING;

-- Step 5: Verify the role was added
SELECT * FROM public.roles ORDER BY name;