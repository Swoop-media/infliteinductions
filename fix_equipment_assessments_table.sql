-- Drop the existing table if it exists
DROP TABLE IF EXISTS equipment_assessments CASCADE;

-- Create the equipment_assessments table properly for Supabase
CREATE TABLE equipment_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  trainee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assessor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending',
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique constraint to ensure only one assessment per trainee per course
ALTER TABLE equipment_assessments
ADD CONSTRAINT equipment_assessments_course_trainee_unique 
UNIQUE (course_id, trainee_id);

-- Create indexes for better query performance
CREATE INDEX idx_equipment_assessments_course_id ON equipment_assessments(course_id);
CREATE INDEX idx_equipment_assessments_trainee_id ON equipment_assessments(trainee_id);

-- Enable Row Level Security
ALTER TABLE equipment_assessments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for assessors and trainees
CREATE POLICY "Assessors can create and update assessments" 
ON equipment_assessments 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM course_assignments 
    WHERE course_id = equipment_assessments.course_id 
    AND user_id = auth.uid()
    AND role IN ('onsite_assessor', 'onsite_trainer', 'trainer', 'assessor')
  )
);

CREATE POLICY "Trainees can view their own assessments" 
ON equipment_assessments 
FOR SELECT 
USING (trainee_id = auth.uid());

-- Grant permissions
GRANT ALL ON equipment_assessments TO authenticated;
GRANT ALL ON equipment_assessments TO service_role;

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';