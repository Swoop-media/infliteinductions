-- Add external_contractors column to courses table
-- This column indicates whether a course is available to external contractors

ALTER TABLE courses 
ADD COLUMN IF NOT EXISTS external_contractors BOOLEAN NOT NULL DEFAULT FALSE;

-- Comment on the column for documentation
COMMENT ON COLUMN courses.external_contractors IS 'Indicates if this course is available to external contractors';

-- Optional: Create an index for better query performance when filtering by external contractors
CREATE INDEX IF NOT EXISTS idx_courses_external_contractors 
ON courses (external_contractors) 
WHERE external_contractors = true;