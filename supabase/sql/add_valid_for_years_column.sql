
-- Add valid_for_years column to courses table for tracking certification validity
ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS valid_for_years INTEGER DEFAULT NULL;

-- Add a comment to explain the column
COMMENT ON COLUMN courses.valid_for_years IS 'Number of years this course certification is valid for. NULL means no expiry.';
