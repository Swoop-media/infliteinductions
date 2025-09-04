
-- Add tags column to authorisations table
ALTER TABLE authorisations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add index for performance when filtering by tags
CREATE INDEX IF NOT EXISTS idx_authorisations_tags ON authorisations USING GIN(tags);
