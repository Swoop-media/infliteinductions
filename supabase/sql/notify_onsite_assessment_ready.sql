
-- Function to notify onsite assessors when a learner completes onsite training
CREATE OR REPLACE FUNCTION notify_onsite_assessment_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignment_id UUID;
  v_course_id UUID;
  v_learner_id UUID;
  v_learner_name TEXT;
  v_learner_email TEXT;
  v_course_title TEXT;
  v_assessor_id UUID;
  v_site_url TEXT := COALESCE(current_setting('app.site_url', true), 'http://localhost:3000');
  v_onsite_training_modules_count INTEGER;
  v_completed_onsite_training_count INTEGER;
  v_has_onsite_assessment BOOLEAN := FALSE;
  v_onsite_assessment_completed BOOLEAN := FALSE;
  v_completed_module_type TEXT;
BEGIN
  RAISE LOG 'notify_onsite_assessment_ready triggered for assignment: %', NEW.assignment_id;

  -- Get assignment and course info
  SELECT ca.id, ca.course_id, ca.user_id
  INTO v_assignment_id, v_course_id, v_learner_id
  FROM course_assignments ca
  WHERE ca.id = NEW.assignment_id;

  -- Skip if we don't have the required info
  IF v_course_id IS NULL OR v_learner_id IS NULL THEN
    RAISE LOG 'notify_onsite_assessment_ready: Missing course_id (%) or learner_id (%), skipping', v_course_id, v_learner_id;
    RETURN NEW;
  END IF;

  -- Check what type of module was just completed
  SELECT cm.type INTO v_completed_module_type
  FROM course_modules cm
  WHERE cm.id = NEW.module_id;

  -- Only proceed if an onsite training module was just completed
  IF v_completed_module_type != 'onsite_training' THEN
    RAISE LOG 'notify_onsite_assessment_ready: Module % is not onsite_training (%), skipping', NEW.module_id, v_completed_module_type;
    RETURN NEW;
  END IF;

  RAISE LOG 'notify_onsite_assessment_ready: Processing course_id=%, learner_id=%, assignment_id=%', v_course_id, v_learner_id, v_assignment_id;

  -- Get learner info
  SELECT 
    COALESCE(p.full_name, au.email) as name,
    au.email
  INTO v_learner_name, v_learner_email
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  WHERE au.id = v_learner_id;

  -- Get course title
  SELECT title INTO v_course_title FROM courses WHERE id = v_course_id;

  -- Check if course has onsite assessment module
  SELECT EXISTS(
    SELECT 1 FROM course_modules 
    WHERE course_id = v_course_id AND type = 'onsite_assessment'
  ) INTO v_has_onsite_assessment;

  -- Skip if no onsite assessment required
  IF NOT v_has_onsite_assessment THEN
    RAISE LOG 'notify_onsite_assessment_ready: Course % has no onsite assessment module, skipping', v_course_title;
    RETURN NEW;
  END IF;

  RAISE LOG 'notify_onsite_assessment_ready: Course % has onsite assessment module', v_course_title;

  -- Count total onsite training modules
  SELECT COUNT(*) INTO v_onsite_training_modules_count
  FROM course_modules
  WHERE course_id = v_course_id 
  AND type = 'onsite_training';

  -- Count completed onsite training modules for this assignment
  SELECT COUNT(*) INTO v_completed_onsite_training_count
  FROM assignment_progress ap
  JOIN course_modules cm ON ap.module_id = cm.id
  WHERE ap.assignment_id = NEW.assignment_id
  AND cm.type = 'onsite_training';

  -- Check if onsite assessment is already completed
  SELECT EXISTS(
    SELECT 1 FROM assignment_progress ap
    JOIN course_modules cm ON ap.module_id = cm.id
    WHERE ap.assignment_id = NEW.assignment_id
    AND cm.type = 'onsite_assessment'
  ) INTO v_onsite_assessment_completed;

  RAISE LOG 'notify_onsite_assessment_ready: Onsite training modules: %/% completed, onsite assessment completed: %', 
    v_completed_onsite_training_count, v_onsite_training_modules_count, v_onsite_assessment_completed;

  -- Only proceed if all onsite training modules are complete and onsite assessment is not yet done
  IF v_completed_onsite_training_count >= v_onsite_training_modules_count AND NOT v_onsite_assessment_completed THEN

    RAISE LOG 'Learner % ready for onsite assessment in course %', v_learner_name, v_course_title;

    -- Notify all onsite assessors assigned to this course
    FOR v_assessor_id IN
      SELECT DISTINCT ca.user_id
      FROM course_assignments ca
      WHERE ca.course_id = v_course_id 
      AND ca.role = 'onsite_assessor'
    LOOP
      BEGIN
        INSERT INTO notifications (
          recipient_id,
          type,
          payload,
          read
        ) VALUES (
          v_assessor_id,
          'onsite_assessment_ready',
          jsonb_build_object(
            'learner_id', v_learner_id,
            'course_id', v_course_id,
            'assignment_id', v_assignment_id,
            'learnerName', v_learner_name,
            'learner_email', v_learner_email,
            'traineeName', v_learner_name,
            'courseTitle', v_course_title,
            'course_title', v_course_title,
            'url', v_site_url || '/app/train-assess',
            'event_id', 'onsite_assessment_ready_' || v_learner_id::text || '_' || v_course_id::text
          ),
          false
        );

        RAISE LOG 'Notification sent to assessor: %', v_assessor_id;

      EXCEPTION
        WHEN unique_violation THEN
          RAISE LOG 'Notification already exists for assessor % (learner % in course %), skipping', 
            v_assessor_id, v_learner_name, v_course_title;
        WHEN OTHERS THEN
          RAISE WARNING 'Failed to notify assessor %: % (SQLSTATE: %)', 
            v_assessor_id, SQLERRM, SQLSTATE;
      END;
    END LOOP;

  ELSE
    RAISE LOG 'notify_onsite_assessment_ready: Conditions not met for %. Onsite training: %/%, assessment completed: %', 
      v_learner_name, v_completed_onsite_training_count, v_onsite_training_modules_count, v_onsite_assessment_completed;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for assignment_progress table
DROP TRIGGER IF EXISTS trg_notify_onsite_assessment_ready_assignment ON assignment_progress;
CREATE TRIGGER trg_notify_onsite_assessment_ready_assignment
  AFTER INSERT ON assignment_progress
  FOR EACH ROW
  EXECUTE FUNCTION notify_onsite_assessment_ready();
