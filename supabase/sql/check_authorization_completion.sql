-- Function to check if all courses for an authorization are completed
-- and update the authorization status to pending_approval
CREATE OR REPLACE FUNCTION public.check_authorization_completion(p_user_id UUID, p_course_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_id UUID;
    v_total_courses INTEGER;
    v_completed_courses INTEGER;
    v_auth_assignment_id UUID;
BEGIN
    -- Find all authorizations that include this course
    FOR v_auth_id IN
        SELECT DISTINCT ac.authorisation_id
        FROM authorisation_courses ac
        WHERE ac.course_id = p_course_id
    LOOP
        -- Count total courses required for this authorization
        SELECT COUNT(*)
        INTO v_total_courses
        FROM authorisation_courses
        WHERE authorisation_id = v_auth_id;

        -- Count completed courses for this user and authorization
        SELECT COUNT(*)
        INTO v_completed_courses
        FROM course_assignments ca
        INNER JOIN authorisation_courses ac ON ca.course_id = ac.course_id
        WHERE ca.user_id = p_user_id
        AND ac.authorisation_id = v_auth_id
        AND ca.assignment_status = 'completed'
        AND ca.role = 'trainee';

        -- If all courses are completed, update authorization status
        IF v_completed_courses >= v_total_courses AND v_total_courses > 0 THEN
            -- Get the authorization assignment ID
            SELECT id INTO v_auth_assignment_id
            FROM authorisation_assignments
            WHERE user_id = p_user_id
            AND authorisation_id = v_auth_id
            AND role = 'trainee';

            -- Update to pending_approval status if found and not already completed
            IF v_auth_assignment_id IS NOT NULL THEN
                UPDATE authorisation_assignments
                SET 
                    assignment_status = 'pending_approval',
                    completed_at = COALESCE(completed_at, NOW()),
                    updated_at = NOW()
                WHERE id = v_auth_assignment_id
                AND assignment_status NOT IN ('completed', 'pending_approval');

                -- Log the status change
                RAISE NOTICE 'Authorization % for user % updated to pending_approval', v_auth_id, p_user_id;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_authorization_completion(UUID, UUID) TO authenticated;

-- Create a trigger function to call check_authorization_completion when course is completed
CREATE OR REPLACE FUNCTION public.trigger_check_authorization_on_course_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only check if the status changed to 'completed'
    IF NEW.assignment_status = 'completed' AND 
       (OLD.assignment_status IS NULL OR OLD.assignment_status != 'completed') AND
       NEW.role = 'trainee' THEN
        -- Check authorization completion for this user and course
        PERFORM check_authorization_completion(NEW.user_id, NEW.course_id);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger on course_assignments table
DROP TRIGGER IF EXISTS check_authorization_completion_trigger ON course_assignments;
CREATE TRIGGER check_authorization_completion_trigger
    AFTER UPDATE OF assignment_status ON course_assignments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_authorization_on_course_complete();

-- Also trigger on insert in case a course is created as completed
DROP TRIGGER IF EXISTS check_authorization_completion_on_insert ON course_assignments;
CREATE TRIGGER check_authorization_completion_on_insert
    AFTER INSERT ON course_assignments
    FOR EACH ROW
    WHEN (NEW.assignment_status = 'completed' AND NEW.role = 'trainee')
    EXECUTE FUNCTION trigger_check_authorization_on_course_complete();