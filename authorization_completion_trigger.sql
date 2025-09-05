
-- Trigger to automatically check for authorization completion when a course assignment is completed
CREATE OR REPLACE FUNCTION public.check_authorization_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_authorization_id UUID;
    v_total_courses INTEGER;
    v_completed_courses INTEGER;
BEGIN
    -- Only proceed if the assignment was just completed
    IF NEW.assignment_status = 'completed' AND OLD.assignment_status != 'completed' THEN
        -- Find if this course is part of any authorization for this user
        SELECT DISTINCT aa.authorisation_id INTO v_authorization_id
        FROM public.authorisation_assignments aa
        JOIN public.authorisation_courses ac ON ac.authorisation_id = aa.authorisation_id
        WHERE aa.user_id = NEW.user_id 
        AND ac.course_id = NEW.course_id
        AND aa.assignment_status IN ('assigned', 'in_progress')
        LIMIT 1;
        
        -- If we found an authorization, check if all courses are complete
        IF v_authorization_id IS NOT NULL THEN
            -- Count total courses in this authorization
            SELECT COUNT(*) INTO v_total_courses
            FROM public.authorisation_courses
            WHERE authorisation_id = v_authorization_id;
            
            -- Count completed courses for this user in this authorization
            SELECT COUNT(*) INTO v_completed_courses
            FROM public.authorisation_courses ac
            JOIN public.course_assignments ca ON ca.course_id = ac.course_id
            WHERE ac.authorisation_id = v_authorization_id
            AND ca.user_id = NEW.user_id
            AND ca.role = 'trainee'
            AND ca.assignment_status = 'completed';
            
            -- If all courses are completed, mark authorization as completed
            IF v_completed_courses >= v_total_courses AND v_total_courses > 0 THEN
                UPDATE public.authorisation_assignments
                SET 
                    assignment_status = 'completed',
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE authorisation_id = v_authorization_id
                AND user_id = NEW.user_id
                AND assignment_status != 'completed';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS check_authorization_completion_trigger ON public.course_assignments;
CREATE TRIGGER check_authorization_completion_trigger
    AFTER UPDATE ON public.course_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.check_authorization_completion();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.check_authorization_completion() TO authenticated;
