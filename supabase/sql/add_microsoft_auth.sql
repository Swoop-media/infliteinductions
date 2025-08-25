
-- Add microsoft_id column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS microsoft_id TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_microsoft_id 
ON public.users(microsoft_id);

-- Update RLS policies to work with Microsoft auth
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (
    id = auth.uid() OR 
    microsoft_id = auth.jwt() ->> 'microsoft_id'
  );

-- Update existing admin user if needed (replace with your admin email)
-- UPDATE public.users 
-- SET role = 'admin' 
-- WHERE email = 'your-admin@yourdomain.com';
