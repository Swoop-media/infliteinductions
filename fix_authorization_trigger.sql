-- Fix Authorization Trigger Issue
-- This script addresses the problem where authorizations don't move to "pending_approval" 
-- when all courses are completed

-- Step 1: Create or replace the improved trigger function
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
    RAISE NOTICE 'Checking authorization completion for user % and course %', p_user_id, p_course_id;
    
    -- Find all authorizations that include this course
    FOR v_auth_id IN
        SELECT DISTINCT ac.authorisation_id
        FROM authorisation_courses ac
        WHERE ac.course_id = p_course_id
    LOOP
        RAISE NOTICE 'Checking authorization %', v_auth_id;
        
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
        
        RAISE NOTICE 'Authorization % has %/% courses completed', v_auth_id, v_completed_courses, v_total_courses;
        
        -- If all courses are completed, update authorization status
        IF v_completed_courses >= v_total_courses AND v_total_courses > 0 THEN
            -- Get the authorization assignment ID
            SELECT id INTO v_auth_assignment_id
            FROM authorisation_assignments
            WHERE user_id = p_user_id
            AND authorisation_id = v_auth_id
            AND role = 'trainee';
            
            -- Update to pending_approval status if found and not already completed or pending
            IF v_auth_assignment_id IS NOT NULL THEN
                UPDATE authorisation_assignments
                SET 
                    assignment_status = 'pending_approval',
                    completed_at = COALESCE(completed_at, NOW()),
                    updated_at = NOW()
                WHERE id = v_auth_assignment_id
                AND assignment_status = 'assigned';
                
                IF FOUND THEN
                    RAISE NOTICE 'Authorization % for user % updated to pending_approval', v_auth_id, p_user_id;
                ELSE
                    RAISE NOTICE 'Authorization % for user % already in status beyond assigned', v_auth_id, p_user_id;
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- Step 2: Enhanced function to check ALL authorizations for a user
CREATE OR REPLACE FUNCTION public.check_all_user_authorizations(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_record RECORD;
    v_total_courses INTEGER;
    v_completed_courses INTEGER;
BEGIN
    RAISE NOTICE 'Checking all authorizations for user %', p_user_id;
    
    -- Loop through all authorizations for this user
    FOR v_auth_record IN 
        SELECT id, authorisation_id 
        FROM authorisation_assignments 
        WHERE user_id = p_user_id 
        AND role = 'trainee'
        AND assignment_status = 'assigned'
    LOOP
        -- Count total courses for this authorization
        SELECT COUNT(*)
        INTO v_total_courses
        FROM authorisation_courses
        WHERE authorisation_id = v_auth_record.authorisation_id;
        
        -- If no courses linked, try alternative method
        IF v_total_courses = 0 THEN
            -- Check if there are completed courses that might belong to this authorization
            -- This handles cases where authorisation_courses links are missing
            SELECT COUNT(DISTINCT ca.course_id)
            INTO v_completed_courses
            FROM course_assignments ca
            WHERE ca.user_id = p_user_id
            AND ca.assignment_status = 'completed'
            AND ca.role = 'trainee';
            
            -- If user has completed courses but authorization has no links,
            -- assume 1 course authorization and mark as pending if course is complete
            IF v_completed_courses > 0 THEN
                UPDATE authorisation_assignments
                SET 
                    assignment_status = 'pending_approval',
                    completed_at = COALESCE(completed_at, NOW()),
                    updated_at = NOW()
                WHERE id = v_auth_record.id;
                
                RAISE NOTICE 'Authorization % updated to pending_approval (fallback logic)', v_auth_record.authorisation_id;
            END IF;
        ELSE
            -- Normal flow: count completed courses for this authorization
            SELECT COUNT(*)
            INTO v_completed_courses
            FROM course_assignments ca
            INNER JOIN authorisation_courses ac ON ca.course_id = ac.course_id
            WHERE ca.user_id = p_user_id
            AND ac.authorisation_id = v_auth_record.authorisation_id
            AND ca.assignment_status = 'completed'
            AND ca.role = 'trainee';
            
            -- Update if all courses completed
            IF v_completed_courses >= v_total_courses THEN
                UPDATE authorisation_assignments
                SET 
                    assignment_status = 'pending_approval',
                    completed_at = COALESCE(completed_at, NOW()),
                    updated_at = NOW()
                WHERE id = v_auth_record.id;
                
                RAISE NOTICE 'Authorization % updated to pending_approval', v_auth_record.authorisation_id;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- Step 3: Create trigger that fires on course completion
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
        
        -- First try the normal flow
        PERFORM check_authorization_completion(NEW.user_id, NEW.course_id);
        
        -- Also check all authorizations for this user (handles missing links)
        PERFORM check_all_user_authorizations(NEW.user_id);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Step 4: Recreate triggers
DROP TRIGGER IF EXISTS check_authorization_completion_trigger ON course_assignments;
CREATE TRIGGER check_authorization_completion_trigger
    AFTER UPDATE OF assignment_status ON course_assignments
    FOR EACH ROW
    EXECUTE FUNCTION trigger_check_authorization_on_course_complete();

DROP TRIGGER IF EXISTS check_authorization_completion_on_insert ON course_assignments;
CREATE TRIGGER check_authorization_completion_on_insert
    AFTER INSERT ON course_assignments
    FOR EACH ROW
    WHEN (NEW.assignment_status = 'completed' AND NEW.role = 'trainee')
    EXECUTE FUNCTION trigger_check_authorization_on_course_complete();

-- Step 5: Grant permissions
GRANT EXECUTE ON FUNCTION public.check_authorization_completion(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_all_user_authorizations(UUID) TO authenticated;

-- Step 6: Fix any existing stuck authorizations
-- This will find and update any authorizations where all courses are completed
-- but the status is still 'assigned'
UPDATE authorisation_assignments aa
SET 
    assignment_status = 'pending_approval',
    completed_at = COALESCE(completed_at, NOW()),
    updated_at = NOW()
FROM (
    -- Find authorizations with missing links but completed courses
    SELECT DISTINCT
        aa2.id,
        aa2.user_id,
        aa2.authorisation_id,
        CASE 
            WHEN COUNT(ac.course_id) = 0 THEN 
                -- No linked courses, check if user has ANY completed courses
                (SELECT COUNT(*) FROM course_assignments 
                 WHERE user_id = aa2.user_id 
                 AND assignment_status = 'completed' 
                 AND role = 'trainee')
            ELSE 
                -- Has linked courses, count completed ones
                COUNT(CASE WHEN ca.assignment_status = 'completed' THEN 1 END)
        END as completed_courses,
        CASE 
            WHEN COUNT(ac.course_id) = 0 THEN 
                -- If no links exist but user has completed courses, assume 1 course requirement
                CASE WHEN EXISTS (
                    SELECT 1 FROM course_assignments 
                    WHERE user_id = aa2.user_id 
                    AND assignment_status = 'completed' 
                    AND role = 'trainee'
                ) THEN 1 ELSE 0 END
            ELSE 
                COUNT(ac.course_id)
        END as total_courses
    FROM authorisation_assignments aa2
    LEFT JOIN authorisation_courses ac ON aa2.authorisation_id = ac.authorisation_id
    LEFT JOIN course_assignments ca ON ca.course_id = ac.course_id 
        AND ca.user_id = aa2.user_id 
        AND ca.role = 'trainee'
    WHERE aa2.role = 'trainee'
    AND aa2.assignment_status = 'assigned'
    GROUP BY aa2.id, aa2.user_id, aa2.authorisation_id
) AS completion_check
WHERE aa.id = completion_check.id
AND completion_check.completed_courses >= completion_check.total_courses
AND completion_check.total_courses > 0;

-- Report what was fixed
SELECT 
    'Fixed authorizations:' as message,
    COUNT(*) as count
FROM authorisation_assignments
WHERE assignment_status = 'pending_approval'
AND completed_at IS NOT NULL;