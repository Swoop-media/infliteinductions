-- Script to fix assessment requirements that were saved with the wrong role
-- This updates requirements for onsite_assessment modules from 'onsite_trainer' to 'onsite_assessor'

UPDATE onsite_requirements
SET role = 'onsite_assessor'
WHERE module_id IN (
  SELECT id 
  FROM course_modules 
  WHERE type = 'onsite_assessment'
) 
AND role = 'onsite_trainer';

-- Verify the update
SELECT 
  cm.type as module_type,
  r.role,
  COUNT(*) as count
FROM onsite_requirements r
JOIN course_modules cm ON cm.id = r.module_id
GROUP BY cm.type, r.role
ORDER BY cm.type, r.role;