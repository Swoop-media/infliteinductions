-- Script to populate equipment assessment requirements
-- This will create the form questions that should be displayed in the equipment assessment module

-- First, find a module that's labeled as equipment assessment
-- You'll need to replace the module_id with the actual ID of your equipment assessment module

-- Insert equipment assessment requirements
-- Replace 'YOUR_MODULE_ID_HERE' with the actual module ID for the equipment assessment module
INSERT INTO onsite_requirements (id, module_id, role, label, field_type, required, order_index)
VALUES
  (gen_random_uuid(), 'YOUR_MODULE_ID_HERE', 'assessor', 'Assess the equipment form', 'checkbox', true, 0),
  (gen_random_uuid(), 'YOUR_MODULE_ID_HERE', 'assessor', 'review quiz answers if not 100%', 'checkbox', true, 1),
  (gen_random_uuid(), 'YOUR_MODULE_ID_HERE', 'assessor', 'review reserve data card and cross check information', 'checkbox', true, 2),
  (gen_random_uuid(), 'YOUR_MODULE_ID_HERE', 'assessor', 'If canopy pilot ensure they understand rules and requirement of crest', 'checkbox', true, 3),
  (gen_random_uuid(), 'YOUR_MODULE_ID_HERE', 'assessor', 'ensure reserve data card has been emailed to parachute.maintenance@inflite.nz', 'checkbox', true, 4)
ON CONFLICT DO NOTHING;

-- To find the right module ID, run this query first:
-- SELECT id, title, type FROM course_modules WHERE title LIKE '%equipment%' OR title LIKE '%assessment%' OR type LIKE '%assessment%';