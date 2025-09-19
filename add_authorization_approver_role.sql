-- Add the new Authorization Approver role to existing roles table
INSERT INTO public.roles (id, name, description)
VALUES (
    gen_random_uuid(),
    'Authorization Approver',
    'Can approve pending authorizations'
)
ON CONFLICT (name) DO NOTHING;

-- To check if it was added successfully:
-- SELECT * FROM public.roles WHERE name = 'Authorization Approver';

-- To grant this role to a specific user (replace USER_ID with actual user ID):
-- INSERT INTO public.user_roles (user_id, role_id)
-- SELECT 
--     'USER_ID_HERE'::uuid,
--     id
-- FROM public.roles
-- WHERE name = 'Authorization Approver';