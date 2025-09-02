
-- Function to update assignment status based on progress
CREATE OR REPLACE FUNCTION update_assignment_status_on_progress()
RETURNS TRIGGER AS $$
DECLARE
    total_modules_count INTEGER;
    completed_modules_count INTEGER;
    current_status TEXT;
BEGIN
    -- Log trigger execution
    RAISE LOG 'update_assignment_status_on_progress triggered for assignment_id: %', NEW.assignment_id;
    
    -- Count total modules for the course
    SELECT COUNT(*)
    INTO total_modules_count
    FROM course_modules cm
    JOIN course_assignments ca ON ca.course_id = cm.course_id
    WHERE ca.id = NEW.assignment_id;
    
    -- Count completed modules for this assignment
    SELECT COUNT(*)
    INTO completed_modules_count
    FROM assignment_progress ap
    WHERE ap.assignment_id = NEW.assignment_id;
    
    -- Get current assignment status
    SELECT assignment_status INTO current_status
    FROM course_assignments
    WHERE id = NEW.assignment_id;
    
    RAISE LOG 'Assignment %, total modules: %, completed: %, current status: %', 
        NEW.assignment_id, total_modules_count, completed_modules_count, current_status;
    
    -- Update assignment status based on progress
    IF completed_modules_count >= total_modules_count AND total_modules_count > 0 THEN
        -- All modules completed
        UPDATE course_assignments
        SET assignment_status = 'completed',
            completed_at = NOW()
        WHERE id = NEW.assignment_id
        AND assignment_status != 'completed'; -- Only update if not already completed
        
        RAISE LOG 'Assignment % marked as completed (% of % modules)', NEW.assignment_id, completed_modules_count, total_modules_count;
    ELSIF completed_modules_count > 0 THEN
        -- Some modules completed
        UPDATE course_assignments
        SET assignment_status = 'in_progress'
        WHERE id = NEW.assignment_id
        AND assignment_status = 'assigned'; -- Only update from assigned to in_progress
        
        RAISE LOG 'Assignment % marked as in_progress (% of % modules)', NEW.assignment_id, completed_modules_count, total_modules_count;
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in update_assignment_status_on_progress for assignment %: % (SQLSTATE: %)', 
            NEW.assignment_id, SQLERRM, SQLSTATE;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_update_assignment_status ON assignment_progress;
CREATE TRIGGER trg_update_assignment_status
    AFTER INSERT ON assignment_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_assignment_status_on_progress();
