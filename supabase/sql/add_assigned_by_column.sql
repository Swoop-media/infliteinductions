
-- Add assigned_by column to authorisation_assignments table
ALTER TABLE public.authorisation_assignments 
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_authorisation_assignments_assigned_by 
ON public.authorisation_assignments(assigned_by);

-- Update the trigger function to handle the new column
CREATE OR REPLACE FUNCTION auto_assign_authorization_courses()
RETURNS TRIGGER AS $$
DECLARE
    course_record RECORD;
BEGIN
    -- Only process when a new authorization assignment is created
    IF TG_OP = 'INSERT' THEN
        -- Get all courses in this authorization
        FOR course_record IN
            SELECT ac.course_id
            FROM authorisation_courses ac
            WHERE ac.authorisation_id = NEW.authorisation_id
        LOOP
            -- Insert course assignment for this user as trainee (ignore if already exists)
            INSERT INTO course_assignments (
                user_id,
                course_id,
                role,
                assigned_by,
                assignment_status,
                created_at
            ) VALUES (
                NEW.user_id,
                course_record.course_id,
                'trainee',
                NEW.assigned_by,
                'assigned',
                NOW()
            )
            ON CONFLICT (course_id, user_id, role) DO NOTHING;
            
            RAISE LOG 'Auto-assigned user % as trainee to course % via authorization %', 
                NEW.user_id, course_record.course_id, NEW.authorisation_id;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
