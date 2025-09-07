
-- Function to try completing an assignment when all modules are done
CREATE OR REPLACE FUNCTION public.try_complete_assignment(p_assignment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_course_id UUID;
    v_total_modules INTEGER;
    v_completed_modules INTEGER;
BEGIN
    -- Get the course ID for this assignment
    SELECT course_id INTO v_course_id
    FROM public.course_assignments
    WHERE id = p_assignment_id;
    
    IF v_course_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Count total modules for this course
    SELECT count(*) INTO v_total_modules
    FROM public.course_modules
    WHERE course_id = v_course_id;
    
    -- Count completed modules for this assignment
    SELECT count(*) INTO v_completed_modules
    FROM public.assignment_progress
    WHERE assignment_id = p_assignment_id;
    
    -- If all modules are completed, mark assignment as completed
    IF v_completed_modules >= v_total_modules AND v_total_modules > 0 THEN
        UPDATE public.course_assignments
        SET 
            status = 'completed',
            completed_at = now(),
            updated_at = now()
        WHERE id = p_assignment_id
        AND status != 'completed'; -- Only update if not already completed
    END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.try_complete_assignment(UUID) TO authenticated;
