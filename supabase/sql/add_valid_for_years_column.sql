
-- Add valid_for_days column to courses table for tracking certification validity
ALTER TABLE courses 
DROP COLUMN IF EXISTS valid_for_years;

ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS valid_for_days INTEGER DEFAULT NULL;

-- Add a comment to explain the column
COMMENT ON COLUMN courses.valid_for_days IS 'Number of days this course certification is valid for. NULL means no expiry.';
