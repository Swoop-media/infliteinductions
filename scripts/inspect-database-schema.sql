-- ============================================
-- DATABASE SCHEMA INSPECTION QUERIES
-- ============================================
-- Run these queries to understand your current database structure
-- Copy and run each section in your Supabase SQL editor

-- ============================================
-- 1. LIST ALL TABLES
-- ============================================
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- 2. EQUIPMENT-RELATED TABLES STRUCTURE
-- ============================================

-- 2.1 Equipment Templates Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'equipment_templates'
ORDER BY ordinal_position;

-- 2.2 Equipment Update Requests Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'equipment_update_requests'
ORDER BY ordinal_position;

-- 2.3 Trainee Equipment Responses Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'trainee_equipment_responses'
ORDER BY ordinal_position;

-- 2.4 Assessor Equipment Confirmations Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'assessor_equipment_confirmations'
ORDER BY ordinal_position;

-- 2.5 Equipment Assessments Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'equipment_assessments'
ORDER BY ordinal_position;

-- ============================================
-- 3. FORM-RELATED TABLES STRUCTURE
-- ============================================

-- 3.1 Form Instances Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'form_instances'
ORDER BY ordinal_position;

-- 3.2 Form Items Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'form_items'
ORDER BY ordinal_position;

-- 3.3 Form Responses Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'form_responses'
ORDER BY ordinal_position;

-- 3.4 Form Progress Cache Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'form_progress_cache'
ORDER BY ordinal_position;

-- ============================================
-- 4. MODULE AND COURSE TABLES STRUCTURE
-- ============================================

-- 4.1 Course Modules Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'course_modules'
ORDER BY ordinal_position;

-- 4.2 Module Content Blocks Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'module_content_blocks'
ORDER BY ordinal_position;

-- ============================================
-- 5. REQUIREMENT TABLES STRUCTURE
-- ============================================

-- 5.1 Onsite Requirements Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'onsite_requirements'
ORDER BY ordinal_position;

-- 5.2 Requirement Responses Table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'requirement_responses'
ORDER BY ordinal_position;

-- ============================================
-- 6. CHECK FOREIGN KEY RELATIONSHIPS
-- ============================================
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name IN (
        'equipment_templates',
        'trainee_equipment_responses', 
        'assessor_equipment_confirmations',
        'form_instances',
        'form_items',
        'form_responses',
        'onsite_requirements',
        'requirement_responses',
        'course_modules',
        'module_content_blocks'
    )
ORDER BY tc.table_name, kcu.column_name;

-- ============================================
-- 7. CHECK FOR EXISTING DATA
-- ============================================

-- 7.1 Count records in equipment tables
SELECT 'equipment_templates' as table_name, COUNT(*) as record_count FROM equipment_templates
UNION ALL
SELECT 'trainee_equipment_responses', COUNT(*) FROM trainee_equipment_responses
UNION ALL
SELECT 'assessor_equipment_confirmations', COUNT(*) FROM assessor_equipment_confirmations
UNION ALL
SELECT 'equipment_assessments', COUNT(*) FROM equipment_assessments
UNION ALL
SELECT 'form_instances', COUNT(*) FROM form_instances
UNION ALL
SELECT 'form_items', COUNT(*) FROM form_items
UNION ALL
SELECT 'form_responses', COUNT(*) FROM form_responses
UNION ALL
SELECT 'onsite_requirements', COUNT(*) FROM onsite_requirements
UNION ALL
SELECT 'requirement_responses', COUNT(*) FROM requirement_responses;

-- ============================================
-- 8. CHECK SAMPLE DATA IN KEY TABLES
-- ============================================

-- 8.1 Sample equipment templates
SELECT * FROM equipment_templates LIMIT 5;

-- 8.2 Sample form instances
SELECT * FROM form_instances LIMIT 5;

-- 8.3 Sample form items
SELECT * FROM form_items LIMIT 5;

-- 8.4 Sample onsite requirements  
SELECT * FROM onsite_requirements LIMIT 5;

-- 8.5 Check modules with equipment assessment enabled
SELECT 
    id,
    title,
    type,
    include_equipment_assessment,
    course_id
FROM course_modules 
WHERE include_equipment_assessment = true
    OR type = 'onsite_assessment'
LIMIT 10;

-- ============================================
-- 9. IDENTIFY MISSING COLUMNS OR TABLES
-- ============================================

-- Check if include_equipment_assessment column exists in course_modules
SELECT 
    column_name
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'course_modules'
    AND column_name = 'include_equipment_assessment';

-- Check if module_id column exists in form_instances
SELECT 
    column_name
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'form_instances'
    AND column_name = 'module_id';

-- ============================================
-- 10. ANALYZE DATA RELATIONSHIPS
-- ============================================

-- Check how equipment data relates to modules
SELECT 
    cm.id as module_id,
    cm.title as module_title,
    cm.type,
    cm.include_equipment_assessment,
    COUNT(DISTINCT et.id) as equipment_template_count,
    COUNT(DISTINCT mcb.id) as equipment_block_count
FROM course_modules cm
LEFT JOIN equipment_templates et ON et.course_id = cm.course_id
LEFT JOIN module_content_blocks mcb ON mcb.module_id = cm.id AND mcb.kind = 'equipment_form'
WHERE cm.type IN ('onsite_assessment', 'digital_training')
GROUP BY cm.id, cm.title, cm.type, cm.include_equipment_assessment
LIMIT 20;