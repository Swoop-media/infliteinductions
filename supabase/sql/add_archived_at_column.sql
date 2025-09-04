
-- Add archived_at column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_archived_at ON profiles(archived_at);

-- Update RLS policies to exclude archived users from normal queries
-- This will help hide archived users from regular lists
CREATE OR REPLACE POLICY "Users can view active profiles"
ON profiles FOR SELECT
USING (archived_at IS NULL OR auth.uid() = id);

-- Admins can see all profiles including archived ones
CREATE OR REPLACE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
    AND r.name = 'Admin'
  )
);
