-- SQL for Contractor Management System
-- Run this in your Supabase SQL Editor

-- 1. Create sites table for work locations
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    address TEXT,
    contact_person VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add some default sites
INSERT INTO sites (name, address) VALUES 
    ('Head Office', 'Main Corporate Location'),
    ('Warehouse A', 'Primary Storage Facility'),
    ('Construction Site 1', 'New Development Project'),
    ('Remote Location', 'Off-site Work Location')
ON CONFLICT (name) DO NOTHING;

-- 2. Create contractor course completions table
CREATE TABLE IF NOT EXISTS contractor_course_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL,
    contractor_name VARCHAR(255) NOT NULL,
    contractor_email VARCHAR(255) NOT NULL,
    site_id UUID NOT NULL REFERENCES sites(id),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    progress_data JSONB DEFAULT '{}',
    final_score DECIMAL(5,2),
    certificate_issued BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Add foreign key to courses table
    CONSTRAINT fk_contractor_completions_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_contractor_completions_course_id ON contractor_course_completions(course_id);
CREATE INDEX IF NOT EXISTS idx_contractor_completions_site_id ON contractor_course_completions(site_id);
CREATE INDEX IF NOT EXISTS idx_contractor_completions_email ON contractor_course_completions(contractor_email);
CREATE INDEX IF NOT EXISTS idx_contractor_completions_completed_at ON contractor_course_completions(completed_at) WHERE completed_at IS NOT NULL;

-- Create updated_at trigger for sites table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sites_updated_at 
    BEFORE UPDATE ON sites 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_contractor_completions_updated_at 
    BEFORE UPDATE ON contractor_course_completions 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column();

-- Add Row Level Security policies if needed
-- Enable RLS on the new tables
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_course_completions ENABLE ROW LEVEL SECURITY;

-- Basic policies (adjust based on your authentication system)
-- Allow all authenticated users to read sites
CREATE POLICY "Sites are viewable by authenticated users" 
    ON sites FOR SELECT 
    USING (auth.role() = 'authenticated');

-- Allow all authenticated users to read contractor completions  
CREATE POLICY "Contractor completions are viewable by authenticated users" 
    ON contractor_course_completions FOR SELECT 
    USING (auth.role() = 'authenticated');

-- Allow all authenticated users to insert contractor completions
CREATE POLICY "Allow contractor completion creation" 
    ON contractor_course_completions FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

-- Allow updates to contractor completions (for progress tracking)
CREATE POLICY "Allow contractor completion updates" 
    ON contractor_course_completions FOR UPDATE 
    USING (auth.role() = 'authenticated');

-- Comment on tables for documentation
COMMENT ON TABLE sites IS 'Work locations where contractors complete training';
COMMENT ON TABLE contractor_course_completions IS 'Tracks external contractor course completions and progress';

COMMENT ON COLUMN contractor_course_completions.progress_data IS 'JSON data storing module completion status and quiz scores';
COMMENT ON COLUMN contractor_course_completions.final_score IS 'Overall course completion score as percentage';
COMMENT ON COLUMN contractor_course_completions.certificate_issued IS 'Whether completion certificate has been generated';