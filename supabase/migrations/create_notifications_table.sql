-- Create notifications table for storing in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ
);

-- Create indices for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- Create unique index for event_id deduplication (prevents duplicate notifications)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_event_per_user
    ON notifications ((payload->>'event_id'), recipient_id)
    WHERE (payload ? 'event_id');

-- Add RLS (Row Level Security) policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to see their own notifications
CREATE POLICY "Users can view their own notifications" 
    ON notifications FOR SELECT 
    USING (auth.uid() = recipient_id);

-- Policy to allow users to mark their own notifications as read
CREATE POLICY "Users can update their own notifications" 
    ON notifications FOR UPDATE 
    USING (auth.uid() = recipient_id)
    WITH CHECK (auth.uid() = recipient_id);

-- Policy to allow service role to insert notifications (for backend services)
CREATE POLICY "Service role can insert notifications" 
    ON notifications FOR INSERT 
    WITH CHECK (true);

-- Policy to allow service role to manage all notifications
CREATE POLICY "Service role can manage all notifications" 
    ON notifications FOR ALL 
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, UPDATE ON notifications TO authenticated;
GRANT ALL ON notifications TO service_role;

-- Add comment for documentation
COMMENT ON TABLE notifications IS 'Stores in-app notifications for users including Teams message records';
COMMENT ON COLUMN notifications.recipient_id IS 'User ID who receives the notification';
COMMENT ON COLUMN notifications.type IS 'Type of notification (e.g. document_expiry_30, authorization_expired, etc)';
COMMENT ON COLUMN notifications.payload IS 'JSON data containing notification details';
COMMENT ON COLUMN notifications.read IS 'Whether the notification has been read by the user';
COMMENT ON COLUMN notifications.read_at IS 'Timestamp when notification was marked as read';