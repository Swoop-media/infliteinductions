-- Final script to fix assessment requirements
-- This handles all cases and avoids constraint violations

-- Step 1: First, see what we have
SELECT 
  cm.type as module_type,
  cm.title as module_title,
  r.role,
  COUNT(*) as requirement_count
FROM onsite_requirements r
JOIN course_modules cm ON cm.id = r.module_id
GROUP BY cm.type, cm.title, r.role
ORDER BY cm.type, cm.title, r.role;

-- Step 2: For assessment modules, update requirements from 'trainer' to 'assessor'
-- We use a temporary high order_index to avoid conflicts during the update
WITH assessment_requirements AS (
  SELECT r.id
  FROM onsite_requirements r
  JOIN course_modules cm ON cm.id = r.module_id
  WHERE cm.type = 'onsite_assessment'
  AND r.role IN ('trainer', 'onsite_trainer')
)
UPDATE onsite_requirements
SET 
  role = 'assessor',
  order_index = order_index + 10000
WHERE id IN (SELECT id FROM assessment_requirements);

-- Step 3: Reset order_index back to normal values
UPDATE onsite_requirements
SET order_index = order_index - 10000
WHERE role = 'assessor'
AND order_index >= 10000;

-- Step 4: Clean up any duplicate assessor requirements if they exist
-- (keeping the ones with lower order_index)
DELETE FROM onsite_requirements r1
WHERE EXISTS (
  SELECT 1 FROM onsite_requirements r2
  WHERE r2.module_id = r1.module_id
  AND r2.role = r1.role
  AND r2.order_index < r1.order_index
  AND r1.role = 'assessor'
);

-- Step 5: Verify the final state
SELECT 
  cm.type as module_type,
  r.role,
  COUNT(*) as count
FROM onsite_requirements r
JOIN course_modules cm ON cm.id = r.module_id
GROUP BY cm.type, r.role
ORDER BY cm.type, r.role;

-- Expected result:
-- onsite_training modules should have requirements with role = 'trainer'
-- onsite_assessment modules should have requirements with role = 'assessor'