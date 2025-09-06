
-- Test script for pending authorisation notifications
-- This will trigger a notification to Senior Management users

-- First, let's check if we have any authorisation assignments to test with
SELECT 
    aa.id,
    aa.assignment_status,
    aa.user_id,
    aa.authorisation_id,
    a.title as authorisation_title,
    p.full_name as trainee_name,
    p.email as trainee_email
FROM authorisation_assignments aa
JOIN authorisations a ON a.id = aa.authorisation_id
JOIN profiles p ON p.id = aa.user_id
WHERE aa.assignment_status IN ('in_progress', 'completed')
LIMIT 5;

-- Check if we have Senior Management users
SELECT 
    p.id,
    p.full_name,
    p.email
FROM profiles p
JOIN user_roles ur ON p.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
WHERE r.name = 'Senior Management';

-- Test notification by updating an assignment to pending_approval
-- Uncomment the line below to test (replace with an actual assignment ID)
-- UPDATE authorisation_assignments SET assignment_status = 'pending_approval' WHERE id = 'your-assignment-id-here';

-- Check if notifications were created
SELECT 
    n.id,
    n.recipient_id,
    n.type,
    n.payload,
    n.read,
    n.created_at,
    p.full_name as recipient_name
FROM notifications n
JOIN profiles p ON p.id = n.recipient_id
WHERE n.type = 'authorisation_pending_approval'
ORDER BY n.created_at DESC
LIMIT 10;
