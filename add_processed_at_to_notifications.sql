
-- Add processed_at column to track which notifications have been sent via Teams
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_processed_at ON public.notifications(processed_at);

-- Create index for unprocessed pending approval notifications
CREATE INDEX IF NOT EXISTS idx_notifications_pending_processing 
ON public.notifications(type, read, processed_at) 
WHERE type = 'authorisation_pending_approval' AND read = false AND processed_at IS NULL;
