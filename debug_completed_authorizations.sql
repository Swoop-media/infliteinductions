
-- Debug query to check what authorization assignments exist for this user
-- Replace 'aaaf24e3-9b9b-41d2-ac52-220d1ee25551' with the actual user ID from the URL

SELECT 
    'ALL AUTHORIZATION ASSIGNMENTS FOR USER:' as section,
    aa.id,
    aa.assignment_status,
    aa.completed_at,
    aa.approved_at,
    aa.created_at,
    a.title as authorization_title,
    a.valid_for_days,
    a.valid_for_years
FROM authorisation_assignments aa
JOIN authorisations a ON a.id = aa.authorisation_id
WHERE aa.user_id = 'aaaf24e3-9b9b-41d2-ac52-220d1ee25551'
ORDER BY aa.created_at DESC;

-- Check specifically for completed ones
SELECT 
    'COMPLETED AUTHORIZATION ASSIGNMENTS:' as section,
    aa.id,
    aa.assignment_status,
    aa.completed_at,
    aa.approved_at,
    a.title as authorization_title,
    a.valid_for_days,
    a.valid_for_years
FROM authorisation_assignments aa
JOIN authorisations a ON a.id = aa.authorisation_id
WHERE aa.user_id = 'aaaf24e3-9b9b-41d2-ac52-220d1ee25551'
AND aa.assignment_status IN ('completed', 'approved', 'pending_approval')
AND aa.completed_at IS NOT NULL;

-- Check what statuses exist in the system
SELECT 
    'ALL POSSIBLE ASSIGNMENT STATUSES:' as section,
    assignment_status,
    COUNT(*) as count
FROM authorisation_assignments
GROUP BY assignment_status
ORDER BY count DESC;
