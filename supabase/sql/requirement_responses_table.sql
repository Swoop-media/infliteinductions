
-- Table to store trainer/assessor responses to requirements
CREATE TABLE IF NOT EXISTS requirement_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requirement_id UUID NOT NULL REFERENCES onsite_requirements(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES course_assignments(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response_value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one response per requirement per assignment per trainer
  UNIQUE(requirement_id, assignment_id, trainer_id)
);

-- Add RLS policies
ALTER TABLE requirement_responses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage responses for assignments they're authorized for
CREATE POLICY requirement_responses_trainer_access ON requirement_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM course_assignments ca
      WHERE ca.id = assignment_id
      AND ca.course_id IN (
        SELECT course_id FROM course_assignments
        WHERE user_id = auth.uid()
        AND role IN ('onsite_trainer', 'onsite_assessor')
      )
    )
  );

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_requirement_responses_assignment ON requirement_responses(assignment_id);
CREATE INDEX IF NOT EXISTS idx_requirement_responses_module ON requirement_responses(module_id);
CREATE INDEX IF NOT EXISTS idx_requirement_responses_trainer ON requirement_responses(trainer_id);
CREATE INDEX IF NOT EXISTS idx_requirement_responses_requirement ON requirement_responses(requirement_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_requirement_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER trigger_requirement_responses_updated_at
  BEFORE UPDATE ON requirement_responses
  FOR EACH ROW
  EXECUTE FUNCTION update_requirement_responses_updated_at();
