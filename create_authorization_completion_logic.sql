
-- Function to check if authorization is complete when a course assignment is updated
CREATE OR REPLACE FUNCTION public.check_authorization_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_authorization_id UUID;
    v_total_courses INTEGER;
    v_completed_courses INTEGER;
BEGIN
    -- Only process completed course assignments for trainees
    IF NEW.assignment_status = 'completed' AND NEW.role = 'trainee' AND 
       (OLD.assignment_status IS NULL OR OLD.assignment_status != 'completed') THEN
        
        -- Find all authorizations that include this course for this user
        FOR v_authorization_id IN 
            SELECT DISTINCT ac.authorisation_id
            FROM public.authorisation_courses ac
            JOIN public.authorisation_assignments aa ON aa.authorisation_id = ac.authorisation_id
            WHERE ac.course_id = NEW.course_id
            AND aa.user_id = NEW.user_id
            AND aa.assignment_status IN ('assigned', 'in_progress')
        LOOP
            -- Count total courses required for this authorization
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

            -- If all courses are completed, mark authorization as pending approval
            IF v_completed_courses >= v_total_courses AND v_total_courses > 0 THEN
                UPDATE public.authorisation_assignments
                SET 
                    assignment_status = 'pending_approval',
                    completed_at = NOW()
                WHERE authorisation_id = v_authorization_id
                AND user_id = NEW.user_id
                AND assignment_status IN ('assigned', 'in_progress');

                RAISE LOG 'Authorization % pending approval for user %', v_authorization_id, NEW.user_id;
                
                -- Insert a notification record that your app can process
                INSERT INTO public.notifications (
                    recipient_id,
                    type,
                    payload,
                    read,
                    created_at
                ) 
                SELECT 
                    p.id as recipient_id,
                    'authorisation_pending_approval'::text as type,
                    jsonb_build_object(
                        'event_id', 'auth_pending_' || v_authorization_id::text || '_' || extract(epoch from now())::text,
                        'title', 'Authorisation Pending Approval',
                        'authorizationTitle', a.title,
                        'learnerName', trainee.full_name,
                        'learner_email', trainee.email,
                        'assignmentId', aa.id,
                        'url', '/app/admin/review/' || aa.id::text
                    ) as payload,
                    false as read,
                    now() as created_at
                FROM profiles p
                JOIN user_roles ur ON p.id = ur.user_id
                JOIN roles r ON ur.role_id = r.id
                JOIN authorisations a ON a.id = v_authorization_id
                JOIN profiles trainee ON trainee.id = NEW.user_id
                JOIN authorisation_assignments aa ON aa.authorisation_id = v_authorization_id AND aa.user_id = NEW.user_id
                WHERE r.name = 'Senior Management';

                RAISE LOG 'Pending approval notifications created for authorization %', v_authorization_id;
            END IF;
        END LOOP;
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
