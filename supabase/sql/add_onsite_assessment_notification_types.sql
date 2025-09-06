
-- Add missing notification types to the enum if they don't exist
DO $$ 
BEGIN
    -- Add onsite_assessment_ready type
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'onsite_assessment_ready' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'notif_type'
        )
    ) THEN
        ALTER TYPE notif_type ADD VALUE 'onsite_assessment_ready';
    END IF;
    
    -- Add course_completed type  
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'course_completed' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'notif_type'
        )
    ) THEN
        ALTER TYPE notif_type ADD VALUE 'course_completed';
    END IF;
    
    -- Add course_expiry_reminder type  
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'course_expiry_reminder' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'notif_type'
        )
    ) THEN
        ALTER TYPE notif_type ADD VALUE 'course_expiry_reminder';
    END IF;
    
    -- Add course_expired type  
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'course_expired' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'notif_type'
        )
    ) THEN
        ALTER TYPE notif_type ADD VALUE 'course_expired';
    END IF;
    
    -- Add authorisation_pending_approval type  
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'authorisation_pending_approval' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'notif_type'
        )
    ) THEN
        ALTER TYPE notif_type ADD VALUE 'authorisation_pending_approval';
    END IF;
    
EXCEPTION
    WHEN undefined_object THEN
        -- If notif_type enum doesn't exist, create it with all needed values
        CREATE TYPE notif_type AS ENUM (
            'enrolment_request',
            'enrolment_approved', 
            'enrolment_revoked',
            'course_assigned',
            'authorization_assigned',
            'authorization_revoked',
            'authorisation_pending_approval',
            'role_granted',
            'role_revoked',
            'status_change',
            'quiz_passed',
            'onsite_training_ready',
            'onsite_assessment_ready',
            'course_completed',
            'course_expiry_reminder',
            'course_expired'
        );
END $$;

-- Update notifications table to use the enum if it has a type column
DO $$
BEGIN
    -- Check if notifications table has type column and update it to use enum
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'type'
        AND data_type = 'text'
    ) THEN
        ALTER TABLE public.notifications 
        ALTER COLUMN type TYPE notif_type USING type::notif_type;
    END IF;
END $$;
