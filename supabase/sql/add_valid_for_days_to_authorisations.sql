-- Add valid_for_days column to authorisations table (matching courses table structure)
ALTER TABLE authorisations ADD COLUMN IF NOT EXISTS valid_for_days INTEGER DEFAULT NULL;

-- Add index for performance when filtering by validity period
CREATE INDEX IF NOT EXISTS idx_authorisations_valid_for_days ON authorisations(valid_for_days);

-- Add comment to explain the column
COMMENT ON COLUMN authorisations.valid_for_days IS 'Number of days this authorization certification is valid for. NULL means no expiry.';