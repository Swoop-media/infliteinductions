-- Migration: Create sites table and add site_id to profiles
-- Date: 2026-02-03
-- Description: Switch from departments to sites for location-based filtering

-- Create sites table
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add initial sites
INSERT INTO sites (name, active) VALUES 
  ('Skydive Abel Tasman', true),
  ('Skydive Mt Cook', true),
  ('Skydive Franz Josef', true),
  ('Skydive Queenstown', true)
ON CONFLICT DO NOTHING;

-- Add site_id column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;

-- Create visitor_signins table with site_id
CREATE TABLE IF NOT EXISTS visitor_signins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  visiting_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  signed_in_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  signed_out_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
