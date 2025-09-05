
-- This is a placeholder SQL file for the routing changes
-- The actual routing changes need to be made in the React components
-- Run this to verify the database structure supports the routing changes

-- Check if we have the necessary data for next course logic
SELECT 
    'Database structure ready for routing changes' as status,
    COUNT(*) as authorization_courses_count
FROM public.authorisation_courses;

-- Verify authorization assignments table has the right structure
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'authorisation_assignments' 
AND table_schema = 'public'
ORDER BY ordinal_position;
