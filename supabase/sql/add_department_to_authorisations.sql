
-- Add department column to authorisations table
ALTER TABLE authorisations ADD COLUMN IF NOT EXISTS department TEXT;

-- Add index for performance when filtering by department
CREATE INDEX IF NOT EXISTS idx_authorisations_department ON authorisations(department);
