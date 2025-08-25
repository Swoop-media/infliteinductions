
-- Add microsoft_id column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS microsoft_id TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_microsoft_id 
ON public.profiles(microsoft_id);

-- Update RLS policies to work with Microsoft auth
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (
    id = auth.uid() OR 
    microsoft_id = auth.jwt() ->> 'microsoft_id'
  );

-- Note: Role management is handled via the user_roles table
-- No need to update profiles directly for roles
