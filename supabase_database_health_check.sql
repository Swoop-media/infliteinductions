-- DATABASE HEALTH AND PERFORMANCE DIAGNOSTIC QUERIES
-- Check for connection, timeout, and performance issues in Supabase

-- ============================================
-- 1. CHECK ACTIVE CONNECTIONS AND POTENTIAL BLOCKS
-- ============================================
-- See all active queries and their runtime
SELECT 
    pid,
    usename,
    application_name,
    client_addr,
    query_start,
    NOW() - query_start as query_duration,
    state,
    wait_event_type,
    wait_event,
    LEFT(query, 100) as query_snippet
FROM pg_stat_activity
WHERE state != 'idle'
AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start;

-- Check for blocked queries
SELECT 
    blocked.pid AS blocked_pid,
    blocked.usename AS blocked_user,
    blocking.pid AS blocking_pid,
    blocking.usename AS blocking_user,
    blocked.query_start,
    NOW() - blocked.query_start AS blocked_duration,
    LEFT(blocked.query, 60) AS blocked_query
FROM pg_stat_activity AS blocked
JOIN pg_stat_activity AS blocking 
    ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.state != 'idle';

-- ============================================
-- 2. CONNECTION POOL STATUS
-- ============================================
-- Check connection count vs max connections
SELECT 
    COUNT(*) as current_connections,
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
    ROUND(COUNT(*) * 100.0 / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 2) as usage_percentage
FROM pg_stat_activity;

-- Connections by application
SELECT 
    application_name,
    COUNT(*) as connection_count,
    COUNT(*) FILTER (WHERE state = 'active') as active_count,
    COUNT(*) FILTER (WHERE state = 'idle') as idle_count,
    COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
GROUP BY application_name
ORDER BY connection_count DESC;

-- ============================================
-- 3. QUERY PERFORMANCE ISSUES
-- ============================================
-- Check for slow queries (if pg_stat_statements is enabled)
-- This will fail if extension not enabled - that's OK
SELECT 
    calls,
    mean_exec_time,
    total_exec_time,
    min_exec_time,
    max_exec_time,
    LEFT(query, 100) as query_snippet
FROM pg_stat_statements
WHERE query LIKE '%course_assignments%'
OR query LIKE '%assignment_progress%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- ============================================
-- 4. TABLE AND INDEX HEALTH
-- ============================================
-- Check table sizes and row counts
SELECT 
    schemaname,
    tablename,
    n_live_tup as row_count,
    n_dead_tup as dead_rows,
    ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_row_percentage,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
AND tablename IN ('course_assignments', 'assignment_progress', 'courses', 'course_modules', 'profiles')
ORDER BY n_live_tup DESC;

-- Check for missing indexes on foreign keys
SELECT 
    c.conname AS constraint_name,
    c.conrelid::regclass AS table_name,
    a.attname AS column_name,
    NOT EXISTS (
        SELECT 1 
        FROM pg_index i 
        WHERE i.indrelid = c.conrelid 
        AND c.conkey[1] = ANY(i.indkey)
    ) AS missing_index
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = c.conkey[1] AND a.attrelid = c.conrelid
WHERE c.contype = 'f'
AND c.conrelid::regclass::text IN (
    'course_assignments', 'assignment_progress', 'courses', 'course_modules'
);

-- ============================================
-- 5. TIMEOUT SETTINGS
-- ============================================
-- Check current timeout settings
SELECT 
    name,
    setting,
    unit,
    context,
    source
FROM pg_settings
WHERE name IN (
    'statement_timeout',
    'idle_in_transaction_session_timeout',
    'lock_timeout',
    'idle_session_timeout'
);

-- ============================================
-- 6. DATABASE LOCKS
-- ============================================
-- Check for table locks
SELECT 
    l.locktype,
    l.relation::regclass as table_name,
    l.mode,
    l.granted,
    a.usename,
    a.query_start,
    NOW() - a.query_start as lock_duration,
    LEFT(a.query, 60) as query
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation::regclass::text IN (
    'course_assignments', 'assignment_progress', 'courses', 'course_modules', 'profiles'
)
ORDER BY a.query_start;

-- ============================================
-- 7. RECENT ERRORS IN LOGS (if you have access)
-- ============================================
-- This query checks for recent errors - may need appropriate permissions
-- Check Supabase Dashboard -> Logs -> Postgres Logs for errors

-- ============================================
-- 8. SPECIFIC TRAIN-ASSESS PAGE QUERY TEST
-- ============================================
-- Test the exact query pattern used by train-assess page with EXPLAIN
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT 
    ca.id,
    ca.user_id,
    ca.course_id,
    ca.created_at,
    ca.assignment_status
FROM course_assignments ca
WHERE ca.role = 'trainee'
AND ca.course_id IN (
    SELECT course_id 
    FROM course_assignments 
    WHERE user_id = '1b44c8f5-95aa-4f8c-8110-8f36106b4d10'
    AND role IN ('onsite_trainer', 'onsite_assessor')
)
LIMIT 10;

-- ============================================
-- 9. CHECK FOR QUERY PLAN ISSUES
-- ============================================
-- Check if statistics are outdated
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    most_common_vals,
    histogram_bounds,
    correlation
FROM pg_stats
WHERE schemaname = 'public'
AND tablename = 'course_assignments'
AND attname IN ('role', 'user_id', 'course_id', 'assignment_status')
LIMIT 20;