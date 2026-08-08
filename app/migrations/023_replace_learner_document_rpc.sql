-- 023: Atomic learner document replacement.
--
-- The learner course-page upload flow calls POST /api/document-replaced,
-- which uses this function to perform the whole replacement in ONE
-- transaction: validate ownership/linkage, mark previous active rows as
-- 'replaced', insert the new active row, and apply the durable re-review
-- state transitions (onsite assessment reset, course assignment demotion,
-- authorisation revert to pending_approval). If any step fails, everything
-- rolls back — a failed insert can no longer strand the learner with no
-- active document, and a partial failure can no longer skip the required
-- re-review.
--
-- Notifications and audit-trail entries remain app-side (they need the
-- Teams/notification dispatcher); only durable state lives here.
--
-- SECURITY: SECURITY DEFINER so it can bypass RLS like the service-role
-- client, but it validates that the module belongs to the course, the block
-- belongs to the module, and the acting user holds a trainee course
-- assignment for the course. EXECUTE is granted to service_role only —
-- browser clients cannot call it.
--
-- Apply in the Supabase SQL editor (see app/migrations/README convention).

CREATE OR REPLACE FUNCTION public.replace_learner_document(
  p_user_id uuid,
  p_course_id uuid,
  p_module_id uuid,
  p_block_id uuid,
  p_title text,
  p_file_path text,
  p_file_size bigint,
  p_file_type text,
  p_expires_on timestamptz,
  p_assignment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_title text;
  v_module_title text;
  v_replaced_count integer := 0;
  v_new_id uuid;
  v_onsite_reset boolean := false;
  v_course_reverted boolean := false;
  v_reverted jsonb := '[]'::jsonb;
  v_deleted integer;
  v_updated integer;
BEGIN
  -- ---- Validation: linkage + ownership --------------------------------
  SELECT c.title INTO v_course_title FROM courses c WHERE c.id = p_course_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_course' USING ERRCODE = 'P0001';
  END IF;

  SELECT m.title INTO v_module_title
  FROM course_modules m
  WHERE m.id = p_module_id AND m.course_id = p_course_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'module_not_in_course' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM module_content_blocks b
    WHERE b.id = p_block_id AND b.module_id = p_module_id
  ) THEN
    RAISE EXCEPTION 'block_not_in_module' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM course_assignments ca
    WHERE ca.user_id = p_user_id
      AND ca.course_id = p_course_id
      AND ca.role = 'trainee'
  ) THEN
    RAISE EXCEPTION 'no_trainee_assignment' USING ERRCODE = 'P0001';
  END IF;

  IF p_assignment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM course_assignments ca
    WHERE ca.id = p_assignment_id
      AND ca.user_id = p_user_id
      AND ca.course_id = p_course_id
  ) THEN
    RAISE EXCEPTION 'assignment_mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- ---- Retention-first replace ----------------------------------------
  UPDATE learner_documents
     SET status = 'replaced', updated_at = now()
   WHERE user_id = p_user_id
     AND module_id = p_module_id
     AND block_id = p_block_id
     AND status IS DISTINCT FROM 'replaced';
  GET DIAGNOSTICS v_replaced_count = ROW_COUNT;

  INSERT INTO learner_documents (
    user_id, course_id, module_id, block_id, title, file_path, file_size,
    file_type, expires_on, assignment_id, course_title, module_title,
    status, created_at
  ) VALUES (
    p_user_id, p_course_id, p_module_id, p_block_id, p_title, p_file_path,
    p_file_size, p_file_type, p_expires_on, p_assignment_id,
    COALESCE(v_course_title, ''), COALESCE(v_module_title, ''),
    'active', now()
  ) RETURNING id INTO v_new_id;

  -- ---- Durable re-review state transitions (only on a real replace) ----
  IF v_replaced_count > 0 THEN
    -- 1) Clear onsite assessment completion for this learner + course
    DELETE FROM assignment_progress ap
     WHERE ap.assignment_id IN (
             SELECT ca.id FROM course_assignments ca
              WHERE ca.user_id = p_user_id
                AND ca.course_id = p_course_id
                AND ca.role = 'trainee')
       AND ap.module_id IN (
             SELECT m.id FROM course_modules m
              WHERE m.course_id = p_course_id
                AND m.type = 'onsite_assessment');
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_onsite_reset := v_deleted > 0;

    -- 2) Demote completed course assignments back to in_progress
    UPDATE course_assignments ca
       SET assignment_status = 'in_progress', completed_at = NULL
     WHERE ca.user_id = p_user_id
       AND ca.course_id = p_course_id
       AND ca.role = 'trainee'
       AND ca.assignment_status = 'completed';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_course_reverted := v_updated > 0;

    -- 3) Revert completed authorisation assignments to pending_approval
    WITH reverted AS (
      UPDATE authorisation_assignments aa
         SET assignment_status = 'pending_approval'
       WHERE aa.user_id = p_user_id
         AND aa.role = 'trainee'
         AND aa.assignment_status = 'completed'
         AND aa.authorisation_id IN (
               SELECT ac.authorisation_id FROM authorisation_courses ac
                WHERE ac.course_id = p_course_id)
      RETURNING aa.id, aa.authorisation_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'assignmentId', r.id,
             'authorisationId', r.authorisation_id,
             'title', COALESCE(a.title, 'Unknown'))), '[]'::jsonb)
      INTO v_reverted
      FROM reverted r
      LEFT JOIN authorisations a ON a.id = r.authorisation_id;
  END IF;

  RETURN jsonb_build_object(
    'documentId', v_new_id,
    'replacedCount', v_replaced_count,
    'onsiteAssessmentReset', v_onsite_reset,
    'courseAssignmentReverted', v_course_reverted,
    'revertedAuthorisations', v_reverted,
    'courseTitle', COALESCE(v_course_title, ''),
    'moduleTitle', COALESCE(v_module_title, '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_learner_document(uuid, uuid, uuid, uuid, text, text, bigint, text, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_learner_document(uuid, uuid, uuid, uuid, text, text, bigint, text, timestamptz, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.replace_learner_document(uuid, uuid, uuid, uuid, text, text, bigint, text, timestamptz, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_learner_document(uuid, uuid, uuid, uuid, text, text, bigint, text, timestamptz, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
