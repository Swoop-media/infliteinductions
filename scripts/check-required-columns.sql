-- ============================================
-- CHECK AND ADD REQUIRED COLUMNS
-- ============================================
-- Run these queries AFTER running inspect-database-schema.sql
-- to determine what needs to be added

-- ============================================
-- STEP 1: CHECK IF KEY COLUMNS EXIST
-- ============================================

-- 1.1 Check if course_modules has include_equipment_assessment
SELECT 
    EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_modules' 
        AND column_name = 'include_equipment_assessment'
    ) as has_equipment_flag;

-- 1.2 Check if form_instances has module_id
SELECT 
    EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'form_instances' 
        AND column_name = 'module_id'
    ) as has_module_id;

-- 1.3 Check if equipment_templates has course_id
SELECT 
    EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'equipment_templates' 
        AND column_name = 'course_id'
    ) as has_course_id;

-- ============================================
-- STEP 2: ADD MISSING COLUMNS (if needed)
-- ============================================
-- ONLY RUN THE QUERIES FOR COLUMNS THAT DON'T EXIST

-- 2.1 Add include_equipment_assessment to course_modules (if missing)
-- ALTER TABLE course_modules 
-- ADD COLUMN IF NOT EXISTS include_equipment_assessment BOOLEAN DEFAULT false;

-- 2.2 Add module_id to form_instances (if missing)
-- ALTER TABLE form_instances 
-- ADD COLUMN IF NOT EXISTS module_id UUID REFERENCES course_modules(id) ON DELETE CASCADE;

-- 2.3 Add indexes for better performance
-- CREATE INDEX IF NOT EXISTS idx_equipment_templates_course_id 
-- ON equipment_templates(course_id);

-- CREATE INDEX IF NOT EXISTS idx_trainee_equipment_responses_user_course 
-- ON trainee_equipment_responses(user_id, course_id);

-- CREATE INDEX IF NOT EXISTS idx_assessor_equipment_confirmations_trainee 
-- ON assessor_equipment_confirmations(trainee_id);

-- ============================================
-- STEP 3: VERIFY RELATIONSHIPS
-- ============================================

-- 3.1 Check equipment templates to courses relationship
SELECT 
    et.id,
    et.equipment_name,
    et.course_id,
    c.title as course_title
FROM equipment_templates et
LEFT JOIN courses c ON et.course_id = c.id
LIMIT 5;

-- 3.2 Check modules with equipment assessment
SELECT 
    cm.id,
    cm.title,
    cm.type,
    cm.include_equipment_assessment,
    c.title as course_title,
    COUNT(et.id) as equipment_count
FROM course_modules cm
JOIN courses c ON cm.course_id = c.id
LEFT JOIN equipment_templates et ON et.course_id = c.id
WHERE cm.type = 'onsite_assessment'
GROUP BY cm.id, cm.title, cm.type, cm.include_equipment_assessment, c.title
LIMIT 10;

-- 3.3 Check form instances and their relationships
SELECT 
    fi.id,
    fi.title,
    fi.module_id,
    cm.title as module_title,
    cm.type as module_type
FROM form_instances fi
LEFT JOIN course_modules cm ON fi.module_id = cm.id
LIMIT 5;

-- ============================================
-- STEP 4: DATA MIGRATION QUERIES (if needed)
-- ============================================

-- 4.1 If you have equipment data in module_content_blocks, migrate to equipment_templates
-- This query shows what equipment data exists in blocks
SELECT 
    mcb.id,
    mcb.module_id,
    mcb.kind,
    mcb.data->>'title' as block_title,
    jsonb_array_length(
        CASE 
            WHEN mcb.data ? 'equipment_templates' 
            THEN mcb.data->'equipment_templates' 
            ELSE '[]'::jsonb 
        END
    ) as equipment_items_count,
    cm.course_id
FROM module_content_blocks mcb
JOIN course_modules cm ON mcb.module_id = cm.id
WHERE mcb.kind = 'equipment_form'
LIMIT 10;

-- 4.2 Extract equipment items from module_content_blocks (if they exist there)
SELECT 
    cm.course_id,
    mcb.module_id,
    equipment_item->>'id' as equipment_id,
    equipment_item->>'equipment_name' as equipment_name,
    equipment_item->>'description' as description,
    (equipment_item->>'required')::boolean as required,
    equipment_item->>'category' as category
FROM module_content_blocks mcb
JOIN course_modules cm ON mcb.module_id = cm.id
CROSS JOIN LATERAL jsonb_array_elements(
    CASE 
        WHEN mcb.data ? 'equipment_templates' 
        THEN mcb.data->'equipment_templates' 
        ELSE '[]'::jsonb 
    END
) as equipment_item
WHERE mcb.kind = 'equipment_form'
LIMIT 20;

-- ============================================
-- STEP 5: CREATE TEST DATA (for development)
-- ============================================

-- 5.1 Find a suitable course and module for testing
SELECT 
    c.id as course_id,
    c.title as course_title,
    cm.id as module_id,
    cm.title as module_title,
    cm.type
FROM courses c
JOIN course_modules cm ON cm.course_id = c.id
WHERE cm.type = 'onsite_assessment'
LIMIT 1;

-- 5.2 Insert test equipment templates (replace IDs with actual values)
-- INSERT INTO equipment_templates (
--     id, 
--     course_id, 
--     equipment_name, 
--     description, 
--     required, 
--     category, 
--     order_index, 
--     created_at, 
--     created_by
-- ) VALUES
--     (gen_random_uuid(), 'YOUR_COURSE_ID', 'Assess the equipment form', 'Verify equipment form completion', true, 'Assessment', 0, NOW(), 'SYSTEM'),
--     (gen_random_uuid(), 'YOUR_COURSE_ID', 'Review quiz answers if not 100%', 'Review incorrect quiz responses', true, 'Assessment', 1, NOW(), 'SYSTEM'),
--     (gen_random_uuid(), 'YOUR_COURSE_ID', 'Review reserve data card', 'Cross-check reserve information', true, 'Assessment', 2, NOW(), 'SYSTEM'),
--     (gen_random_uuid(), 'YOUR_COURSE_ID', 'Canopy pilot rules check', 'Verify understanding of crest requirements', true, 'Assessment', 3, NOW(), 'SYSTEM'),
--     (gen_random_uuid(), 'YOUR_COURSE_ID', 'Data card email confirmation', 'Confirm email to maintenance team', true, 'Assessment', 4, NOW(), 'SYSTEM');

-- 5.3 Enable equipment assessment on a module (replace with actual module ID)
-- UPDATE course_modules 
-- SET include_equipment_assessment = true 
-- WHERE id = 'YOUR_MODULE_ID' 
-- AND type = 'onsite_assessment';

-- ============================================
-- STEP 6: VERIFY FINAL SETUP
-- ============================================

-- 6.1 Final check - modules with equipment
SELECT 
    cm.id as module_id,
    cm.title as module_title,
    cm.type,
    cm.include_equipment_assessment,
    c.id as course_id,
    c.title as course_title,
    COUNT(DISTINCT et.id) as equipment_templates_count,
    COUNT(DISTINCT ter.id) as trainee_responses_count,
    COUNT(DISTINCT aec.id) as assessor_confirmations_count
FROM course_modules cm
JOIN courses c ON cm.course_id = c.id
LEFT JOIN equipment_templates et ON et.course_id = c.id
LEFT JOIN trainee_equipment_responses ter ON ter.course_id = c.id
LEFT JOIN assessor_equipment_confirmations aec ON aec.trainee_id IN (
    SELECT user_id FROM course_assignments WHERE course_id = c.id AND role = 'trainee'
)
WHERE cm.include_equipment_assessment = true
    OR cm.type = 'onsite_assessment'
GROUP BY cm.id, cm.title, cm.type, cm.include_equipment_assessment, c.id, c.title;