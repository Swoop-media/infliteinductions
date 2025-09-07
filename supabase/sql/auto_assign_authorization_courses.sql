
-- Function to automatically assign a user as trainee to all courses in an authorization
CREATE OR REPLACE FUNCTION auto_assign_authorization_courses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
$$;

-- Create trigger to automatically assign courses when authorization is assigned
DROP TRIGGER IF EXISTS trigger_auto_assign_authorization_courses ON authorisation_assignments;
CREATE TRIGGER trigger_auto_assign_authorization_courses
    AFTER INSERT ON authorisation_assignments
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_authorization_courses();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION auto_assign_authorization_courses() TO service_role;
GRANT EXECUTE ON FUNCTION auto_assign_authorization_courses() TO authenticated;
