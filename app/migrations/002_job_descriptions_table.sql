-- Migration: Create job_descriptions table
-- Date: 2026-06-09
-- Description: Replace the hardcoded job description list with an admin-managed table
--              so sites and job descriptions can both be managed from the Admin UI.

-- Create job_descriptions table (mirrors the sites table shape)
CREATE TABLE IF NOT EXISTS job_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed with the previously hardcoded job descriptions
INSERT INTO job_descriptions (name, active) VALUES
  ('Front of house', true),
  ('Ground crew', true),
  ('Tandem master', true),
  ('Camera flyer', true),
  ('Driver', true),
  ('Packer', true),
  ('Helicopter pilot', true),
  ('Fixed wing pilot', true),
  ('Engineer', true)
ON CONFLICT (name) DO NOTHING;

-- Access is performed exclusively through the Supabase admin (service role) client
-- in the Admin pages/routes, so enable RLS with no public policies to deny direct
-- client access by default.
ALTER TABLE job_descriptions ENABLE ROW LEVEL SECURITY;
