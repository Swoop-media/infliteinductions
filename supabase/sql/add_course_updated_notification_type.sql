-- Add course_updated notification type to the enum
-- Safe to re-run: checks if value already exists

DO $$
BEGIN
    -- Check if course_updated value exists in notif_type enum
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notif_type') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum 
            WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notif_type')
            AND enumlabel = 'course_updated'
        ) THEN
            ALTER TYPE notif_type ADD VALUE 'course_updated';
        END IF;
    ELSE
        -- If notif_type enum doesn't exist, create it with all needed values including course_updated
        CREATE TYPE notif_type AS ENUM (
            'role_granted',
            'role_revoked', 
            'profile_updated',
            'enrolment_request',
            'enrolment_approved',
            'enrolment_revoked',
            'course_completed',
            'course_updated',
            'authorisation_ready',
            'onsite_training_ready',
            'onsite_assessment_ready',
            'course_expiry_reminder',
            'course_expired',
            'admin_course_expiry_report',
            'admin_daily_course_summary',
            'admin_daily_authorisation_summary',
            'issue_report',
            'quiz_passed',
            'authorisation_pending_approval'
        );
    END IF;
END$$;