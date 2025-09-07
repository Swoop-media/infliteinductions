
-- Function to manually check and update authorization completions for a user
-- NOTE: search_path is immutable to avoid schema-resolution attacks
CREATE OR REPLACE FUNCTION public.check_user_authorization_completions(p_user_id UUID)
RETURNS TABLE(
    authorization_id UUID,
    authorization_title TEXT,
    was_updated BOOLEAN,
    total_courses INTEGER,
    completed_courses INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    auth_record RECORD;
    v_total_courses INTEGER;
    v_completed_courses INTEGER;
    v_was_updated BOOLEAN;
BEGIN
    -- Loop through all in-progress authorizations for this user
    FOR auth_record IN
        SELECT 
            aa.authorisation_id,
            a.title
        FROM public.authorisation_assignments aa
        JOIN public.authorisations a ON a.id = aa.authorisation_id
        WHERE aa.user_id = p_user_id
        AND aa.assignment_status IN ('assigned', 'in_progress')
    LOOP
        -- Count total courses in this authorization
        SELECT count(*) INTO v_total_courses
        FROM public.authorisation_courses
        WHERE authorisation_id = auth_record.authorisation_id;
        
        -- Count completed courses for this user in this authorization
        SELECT count(*) INTO v_completed_courses
        FROM public.authorisation_courses ac
        JOIN public.course_assignments ca ON ca.course_id = ac.course_id
        WHERE ac.authorisation_id = auth_record.authorisation_id
        AND ca.user_id = p_user_id
        AND ca.role = 'trainee'
        AND ca.assignment_status = 'completed';
        
        -- Check if authorization should be marked complete
        v_was_updated := false;
        IF v_completed_courses >= v_total_courses AND v_total_courses > 0 THEN
            UPDATE public.authorisation_assignments
            SET 
                assignment_status = 'completed',
                completed_at = now(),
                updated_at = now()
            WHERE authorisation_id = auth_record.authorisation_id
            AND user_id = p_user_id
            AND assignment_status != 'completed';
            
            v_was_updated := FOUND;
        END IF;
        
        -- Return the result for this authorization
        authorization_id := auth_record.authorisation_id;
        authorization_title := auth_record.title;
        was_updated := v_was_updated;
        total_courses := v_total_courses;
        completed_courses := v_completed_courses;
        RETURN NEXT;
    END LOOP;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_user_authorization_completions(UUID) TO authenticated;
