
-- Check the structure of the PROFILES table specifically
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Also get sample data from profiles to see what's actually there
SELECT * FROM profiles LIMIT 3;
