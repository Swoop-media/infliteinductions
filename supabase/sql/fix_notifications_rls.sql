
-- Fix RLS policies for notifications table
DROP POLICY IF EXISTS "Users can read their own notifications" ON notifications;
DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Admins and system can insert notifications" ON notifications;

-- Allow users to read their own notifications (both recipient_id and user_id columns)
CREATE POLICY "Users can read their own notifications" ON notifications
  FOR SELECT
  USING (
    auth.uid() = recipient_id OR 
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Allow service role and admins to insert notifications
CREATE POLICY "Service role can insert notifications" ON notifications
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role' OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.name IN ('Admin', 'Trainers and Assessors')
    )
  );

-- Allow users to update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE
  USING (
    auth.uid() = recipient_id OR 
    auth.uid() = user_id OR
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
