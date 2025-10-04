-- SUPABASE DIAGNOSTIC QUERIES FOR TRAIN-ASSESS PAGE ISSUE
-- Run these queries in your Supabase SQL Editor to diagnose the gradual degradation

-- ============================================
-- 0A. WHO HAS TRAINER ASSIGNMENTS FOR WHICH COURSES?
-- ============================================
-- Check which users are assigned as trainers to which courses
SELECT 
    c.title as course_name,
    p.full_name as trainer_name,
    ca.role,
    COUNT(*) OVER (PARTITION BY c.id) as trainers_per_course,
    COUNT(*) OVER (PARTITION BY p.id) as courses_per_trainer
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
JOIN profiles p ON ca.user_id = p.id
WHERE ca.role IN ('onsite_trainer', 'onsite_assessor')
ORDER BY c.title, p.full_name;

-- Count how many courses each trainer is assigned to
SELECT 
    p.full_name,
    COUNT(DISTINCT ca.course_id) as course_count,
    STRING_AGG(DISTINCT c.title, ', ') as courses
FROM course_assignments ca
JOIN profiles p ON ca.user_id = p.id
JOIN courses c ON ca.course_id = c.id
WHERE ca.role IN ('onsite_trainer', 'onsite_assessor')
GROUP BY p.id, p.full_name
ORDER BY course_count DESC;

-- ============================================
-- 0. QUICK CHECK - Does Henry Morgan have trainer assignments?
-- ============================================
-- Simple check for Henry Morgan's trainer/assessor roles
SELECT 
    ca.*,
    c.title as course_title
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
WHERE ca.user_id IN (
    SELECT id FROM profiles WHERE full_name LIKE '%Henry Morgan%'
)
AND ca.role IN ('onsite_trainer', 'onsite_assessor');

-- Check specifically what's happening with Tandem OCA courses
SELECT 
    ca.role,
    ca.user_id,
    p.full_name,
    c.title
FROM course_assignments ca
JOIN profiles p ON ca.user_id = p.id
JOIN courses c ON ca.course_id = c.id
WHERE c.title LIKE '%Tandem OCA%'
AND ca.role IN ('onsite_trainer', 'onsite_assessor')
LIMIT 10;

-- ============================================
-- 1. CHECK TRAINER/ASSESSOR ASSIGNMENTS
-- ============================================
-- See how many trainer/assessor assignments exist and their distribution
SELECT 
    role,
    COUNT(DISTINCT user_id) as unique_trainers,
    COUNT(DISTINCT course_id) as unique_courses,
    COUNT(*) as total_assignments
FROM course_assignments
WHERE role IN ('onsite_trainer', 'onsite_assessor')
GROUP BY role;

-- Check if Henry Morgan has trainer/assessor assignments
SELECT * FROM course_assignments
WHERE user_id IN (
    SELECT id FROM profiles WHERE full_name LIKE '%Henry Morgan%'
)
AND role IN ('onsite_trainer', 'onsite_assessor');

-- ============================================
-- 2. FIND COURSES WITH MISSING TRAINER ASSIGNMENTS
-- ============================================
-- Courses that have trainees but no trainers/assessors
SELECT 
    c.title as course_name,
    c.id as course_id,
    COUNT(DISTINCT ca_trainee.user_id) as trainee_count,
    COUNT(DISTINCT ca_trainer.user_id) as trainer_count,
    COUNT(DISTINCT ca_assessor.user_id) as assessor_count
FROM courses c
LEFT JOIN course_assignments ca_trainee ON c.id = ca_trainee.course_id AND ca_trainee.role = 'trainee'
LEFT JOIN course_assignments ca_trainer ON c.id = ca_trainer.course_id AND ca_trainer.role = 'onsite_trainer'
LEFT JOIN course_assignments ca_assessor ON c.id = ca_assessor.course_id AND ca_assessor.role = 'onsite_assessor'
WHERE ca_trainee.user_id IS NOT NULL
GROUP BY c.id, c.title
HAVING COUNT(DISTINCT ca_trainer.user_id) = 0 OR COUNT(DISTINCT ca_assessor.user_id) = 0
ORDER BY trainee_count DESC;

-- ============================================
-- 3. CHECK WHY ONLY TANDEM OCA IS SHOWING
-- ============================================
-- See what's special about Tandem OCA courses
SELECT 
    c.title,
    c.id,
    ca.role,
    COUNT(DISTINCT ca.user_id) as user_count
FROM courses c
INNER JOIN course_assignments ca ON c.id = ca.course_id
WHERE c.title LIKE '%Tandem OCA%'
GROUP BY c.id, c.title, ca.role;

-- Compare with other courses that should appear
SELECT 
    c.title,
    c.id,
    ca.role,
    COUNT(DISTINCT ca.user_id) as user_count
FROM courses c
INNER JOIN course_assignments ca ON c.id = ca.course_id
WHERE c.title NOT LIKE '%Tandem OCA%'
AND ca.role IN ('onsite_trainer', 'onsite_assessor')
GROUP BY c.id, c.title, ca.role
LIMIT 20;

-- ============================================
-- 4. CHECK ASSIGNMENT_PROGRESS DATA INTEGRITY
-- ============================================
-- Find assignments with incomplete progress tracking
SELECT 
    ca.course_id,
    c.title as course_name,
    ca.user_id,
    p.full_name as user_name,
    ca.assignment_status,
    COUNT(ap.id) as progress_records,
    COUNT(DISTINCT ap.module_id) as modules_with_progress
FROM course_assignments ca
JOIN courses c ON ca.course_id = c.id
JOIN profiles p ON ca.user_id = p.id
LEFT JOIN assignment_progress ap ON ca.id = ap.assignment_id
WHERE ca.role = 'trainee'
AND ca.assignment_status IN ('in_progress', 'approved')
GROUP BY ca.course_id, c.title, ca.user_id, p.full_name, ca.assignment_status
HAVING COUNT(ap.id) = 0
ORDER BY c.title
LIMIT 50;

-- ============================================
-- 5. CHECK FOR ORPHANED OR CORRUPTED DATA
-- ============================================
-- Find assignment_progress records without valid course_assignments
SELECT COUNT(*) as orphaned_progress_records
FROM assignment_progress ap
WHERE NOT EXISTS (
    SELECT 1 FROM course_assignments ca
    WHERE ca.id = ap.assignment_id
);

-- Find course_assignments without corresponding courses
SELECT COUNT(*) as assignments_without_courses
FROM course_assignments ca
WHERE NOT EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = ca.course_id
);

-- ============================================
-- 6. CHECK DATABASE TRIGGERS AND FUNCTIONS
-- ============================================
-- List all triggers to see if any are failing
SELECT 
    schemaname,
    tablename,
    tgname as trigger_name,
    tgenabled as enabled
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY tablename, tgname;

-- Check if any functions are throwing errors (check pg_stat_user_functions)
SELECT 
    schemaname,
    funcname,
    calls,
    total_time,
    mean_time
FROM pg_stat_user_functions
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY total_time DESC;

-- ============================================
-- 7. CHECK FOR RECENT DATA CHANGES
-- ============================================
-- See recent changes to course_assignments (if you have updated_at column)
SELECT 
    DATE(updated_at) as change_date,
    role,
    COUNT(*) as changes_count
FROM course_assignments
WHERE updated_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(updated_at), role
ORDER BY change_date DESC;

-- ============================================
-- 8. CHECK RLS POLICIES
-- ============================================
-- List all RLS policies on course_assignments table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'course_assignments'
ORDER BY policyname;

-- ============================================
-- 9. CHECK FOR QUERY PERFORMANCE ISSUES
-- ============================================
-- Check if there are missing indexes
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE tablename IN ('course_assignments', 'assignment_progress', 'courses', 'course_modules')
AND schemaname = 'public'
ORDER BY tablename, attname;

-- Check table sizes and bloat
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('course_assignments', 'assignment_progress', 'courses', 'course_modules', 'profiles')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================
-- 10. SPECIFIC CHECK FOR THE PENDING TRAINING LOGIC
-- ============================================
-- This mimics what the train-assess page should find
WITH trainer_courses AS (
    SELECT DISTINCT course_id
    FROM course_assignments
    WHERE user_id IN (
        SELECT id FROM profiles WHERE full_name LIKE '%Henry Morgan%'
    )
    AND role = 'onsite_trainer'
),
pending_training AS (
    SELECT 
        ca.id as assignment_id,
        ca.user_id,
        p.full_name as user_name,
        c.title as course_name,
        cm.id as module_id,
        cm.title as module_name,
        cm.type as module_type
    FROM course_assignments ca
    JOIN profiles p ON ca.user_id = p.id
    JOIN courses c ON ca.course_id = c.id
    JOIN course_modules cm ON c.id = cm.course_id
    WHERE ca.course_id IN (SELECT course_id FROM trainer_courses)
    AND ca.role = 'trainee'
    AND ca.assignment_status IN ('approved', 'in_progress')
    AND cm.type = 'onsite_training'
    AND NOT EXISTS (
        SELECT 1 FROM assignment_progress ap
        WHERE ap.assignment_id = ca.id
        AND ap.module_id = cm.id
        -- Record exists with completed_at means it's complete
    )
)
SELECT * FROM pending_training
ORDER BY course_name, user_name
LIMIT 50;

-- ============================================
-- 11. CONNECTION AND LOCK ISSUES
-- ============================================
-- Check for blocking queries
SELECT 
    pid,
    usename,
    application_name,
    client_addr,
    query_start,
    state,
    LEFT(query, 100) as query_snippet
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- Check for table locks
SELECT 
    t.schemaname,
    t.tablename,
    l.mode,
    l.granted,
    a.usename,
    a.query_start
FROM pg_locks l
JOIN pg_stat_all_tables t ON l.relation = t.relid
LEFT JOIN pg_stat_activity a ON l.pid = a.pid
WHERE t.schemaname = 'public'
AND t.tablename IN ('course_assignments', 'assignment_progress')
ORDER BY t.tablename, l.granted DESC;