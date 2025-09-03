
-- Create a test authorization
INSERT INTO public.authorisations (
  id,
  title,
  description,
  status,
  created_by,
  valid_for_years,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'Test Helicopter Pilot Authorization',
  'A test authorization for helicopter pilots',
  'published',
  (SELECT id FROM auth.users LIMIT 1), -- Uses first available user as creator
  2,
  NOW(),
  NOW()
);
