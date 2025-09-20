-- =========================================================
-- OPTION 1: Try a different browser first (no SQL needed)
-- =========================================================
-- Use Firefox, Edge, Safari, or Incognito mode
-- This solves 90% of session cache issues

-- =========================================================
-- OPTION 2: Reset Connor's auth session (moderate approach)
-- =========================================================
-- This clears sessions without losing any assignments

-- Force update his auth record to trigger new session
UPDATE auth.users
SET 
    updated_at = NOW(),
    raw_app_meta_data = raw_app_meta_data || '{"force_refresh": true}'::jsonb
WHERE email = 'connor.johnston@inflite.nz';

-- Clear any active sessions for Connor
DELETE FROM auth.sessions
WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';

SELECT 'Connor auth session reset - he should log in fresh' as status;

-- =========================================================
-- OPTION 3: Complete removal (LAST RESORT - You'll lose everything!)
-- =========================================================
-- BACKUP Connor's assignments first by running this:
/*
SELECT 
    ca.course_id,
    c.title as course_title,
    ca.role
FROM course_assignments ca
JOIN courses c ON c.id = ca.course_id
WHERE ca.user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
AND ca.role IN ('onsite_trainer', 'onsite_assessor')
ORDER BY c.title, ca.role;
*/

-- Then delete Connor completely (uncomment to run):
/*
DELETE FROM assignment_progress WHERE assignment_id IN (
    SELECT id FROM course_assignments WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b'
);
DELETE FROM course_assignments WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';
DELETE FROM user_roles WHERE user_id = '464ef929-8116-47ac-8e95-10a09c14511b';
DELETE FROM profiles WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';
DELETE FROM auth.users WHERE id = '464ef929-8116-47ac-8e95-10a09c14511b';
*/