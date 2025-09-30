-- Script to set up test equipment assessment data
-- This will help verify that equipment forms are displayed properly

-- First, find a course and module to test with
-- You can run this to find suitable courses and modules:
SELECT c.id as course_id, c.title as course_title, 
       cm.id as module_id, cm.title as module_title, cm.type, cm.include_equipment_assessment
FROM courses c
JOIN course_modules cm ON cm.course_id = c.id
WHERE cm.type = 'onsite_assessment'
LIMIT 5;

-- If no modules have equipment assessment enabled, update one:
-- UPDATE course_modules 
-- SET include_equipment_assessment = true 
-- WHERE id = 'YOUR_MODULE_ID' AND type = 'onsite_assessment';

-- Insert equipment templates for a course
-- Replace 'YOUR_COURSE_ID' with an actual course ID
INSERT INTO equipment_templates (id, course_id, equipment_name, description, required, category, order_index, created_at, created_by)
VALUES
  (gen_random_uuid(), 'YOUR_COURSE_ID', 'Assess the equipment form', 'Verify that the equipment form has been properly filled out', true, 'Assessment', 0, NOW(), 'SYSTEM'),
  (gen_random_uuid(), 'YOUR_COURSE_ID', 'Review quiz answers if not 100%', 'Check and review any incorrect quiz answers with the trainee', true, 'Assessment', 1, NOW(), 'SYSTEM'),
  (gen_random_uuid(), 'YOUR_COURSE_ID', 'Review reserve data card and cross check information', 'Verify reserve parachute data card information is accurate', true, 'Assessment', 2, NOW(), 'SYSTEM'),
  (gen_random_uuid(), 'YOUR_COURSE_ID', 'If canopy pilot ensure they understand rules and requirement of crest', 'Confirm understanding of canopy piloting rules and crest requirements', true, 'Assessment', 3, NOW(), 'SYSTEM'),
  (gen_random_uuid(), 'YOUR_COURSE_ID', 'Ensure reserve data card has been emailed to parachute.maintenance@inflite.nz', 'Confirm that reserve data card has been sent to maintenance team', true, 'Assessment', 4, NOW(), 'SYSTEM')
ON CONFLICT DO NOTHING;

-- Verify the data was created:
SELECT et.*, cm.title as module_title, cm.include_equipment_assessment
FROM equipment_templates et
JOIN courses c ON et.course_id = c.id
LEFT JOIN course_modules cm ON cm.course_id = c.id AND cm.type = 'onsite_assessment'
ORDER BY et.order_index;