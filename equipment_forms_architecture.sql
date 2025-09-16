-- Equipment Forms Architecture V2
-- Scalable system for multiple updateable forms per course
-- Supports revision tracking and independent progress computation

-- 1. Form Instances - Each equipment form in a course/module
CREATE TABLE IF NOT EXISTS form_instances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kind VARCHAR(50) DEFAULT 'equipment' NOT NULL, -- Type of form (equipment, safety, etc.)
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id UUID REFERENCES course_modules(id) ON DELETE CASCADE,
  block_id UUID REFERENCES module_content_blocks(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  version INT DEFAULT 1 NOT NULL, -- Version number for schema changes
  requires_assessor_confirmation BOOLEAN DEFAULT false,
  requires_reapproval_on_change BOOLEAN DEFAULT false, -- Policy flag for re-approval
  active BOOLEAN DEFAULT true, -- Is this the current version
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Form Items - Equipment items per form instance
CREATE TABLE IF NOT EXISTS form_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  stable_id VARCHAR(255) NOT NULL, -- Stable field identifier across versions
  equipment_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  required BOOLEAN DEFAULT false,
  order_index INT DEFAULT 0,
  metadata JSONB, -- Additional field configuration
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instance_id, stable_id)
);

-- 3. Form Responses - Trainee submissions with revision history
CREATE TABLE IF NOT EXISTS form_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES form_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  response_text TEXT,
  response_data JSONB, -- For complex responses
  revision_number INT DEFAULT 1 NOT NULL,
  is_latest BOOLEAN DEFAULT true, -- Current revision flag
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 4. Assessor Confirmations - Track assessor reviews
CREATE TABLE IF NOT EXISTS assessor_confirmations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  confirmer_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  notes TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_confirmer FOREIGN KEY (confirmer_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(instance_id, user_id, confirmer_id)
);

-- 5. Update Requests - Track when changes require re-approval
CREATE TABLE IF NOT EXISTS equipment_update_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  triggered_by_change JSONB, -- What changed to trigger this
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviewer FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 6. Progress Cache - Cached completion status per user/instance
CREATE TABLE IF NOT EXISTS form_progress_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_complete BOOLEAN DEFAULT false,
  required_items_count INT DEFAULT 0,
  completed_items_count INT DEFAULT 0,
  is_confirmed BOOLEAN DEFAULT false,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(instance_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_form_instances_course ON form_instances(course_id);
CREATE INDEX IF NOT EXISTS idx_form_instances_module ON form_instances(module_id);
CREATE INDEX IF NOT EXISTS idx_form_instances_block ON form_instances(block_id);
CREATE INDEX IF NOT EXISTS idx_form_items_instance ON form_items(instance_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_instance_user ON form_responses(instance_id, user_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_latest ON form_responses(instance_id, user_id, is_latest) WHERE is_latest = true;
CREATE INDEX IF NOT EXISTS idx_assessor_confirmations_instance_user ON assessor_confirmations(instance_id, user_id);
CREATE INDEX IF NOT EXISTS idx_form_progress_cache_user ON form_progress_cache(user_id);

-- Function to handle revision creation
CREATE OR REPLACE FUNCTION handle_form_response_revision()
RETURNS TRIGGER AS $$
BEGIN
  -- Mark previous versions as not latest
  UPDATE form_responses 
  SET is_latest = false 
  WHERE instance_id = NEW.instance_id 
    AND item_id = NEW.item_id 
    AND user_id = NEW.user_id 
    AND id != NEW.id;
  
  -- Set revision number
  NEW.revision_number = COALESCE(
    (SELECT MAX(revision_number) + 1 
     FROM form_responses 
     WHERE instance_id = NEW.instance_id 
       AND item_id = NEW.item_id 
       AND user_id = NEW.user_id), 
    1
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for revision handling
DROP TRIGGER IF EXISTS form_response_revision_trigger ON form_responses;
CREATE TRIGGER form_response_revision_trigger
  BEFORE INSERT ON form_responses
  FOR EACH ROW
  EXECUTE FUNCTION handle_form_response_revision();

-- Function to update progress cache
CREATE OR REPLACE FUNCTION update_form_progress_cache()
RETURNS TRIGGER AS $$
DECLARE
  v_required_count INT;
  v_completed_count INT;
  v_is_confirmed BOOLEAN;
BEGIN
  -- Count required items
  SELECT COUNT(*) INTO v_required_count
  FROM form_items
  WHERE instance_id = NEW.instance_id AND required = true;
  
  -- Count completed required items
  SELECT COUNT(DISTINCT fi.id) INTO v_completed_count
  FROM form_items fi
  JOIN form_responses fr ON fi.id = fr.item_id
  WHERE fi.instance_id = NEW.instance_id 
    AND fi.required = true 
    AND fr.user_id = NEW.user_id 
    AND fr.is_latest = true
    AND fr.response_text IS NOT NULL 
    AND fr.response_text != '';
  
  -- Check if confirmed by assessor
  SELECT EXISTS(
    SELECT 1 FROM assessor_confirmations
    WHERE instance_id = NEW.instance_id 
      AND user_id = NEW.user_id 
      AND status = 'approved'
  ) INTO v_is_confirmed;
  
  -- Upsert progress cache
  INSERT INTO form_progress_cache (
    instance_id, user_id, 
    required_items_count, completed_items_count,
    is_complete, is_confirmed, last_updated
  ) VALUES (
    NEW.instance_id, NEW.user_id,
    v_required_count, v_completed_count,
    v_completed_count >= v_required_count, v_is_confirmed, CURRENT_TIMESTAMP
  )
  ON CONFLICT (instance_id, user_id) 
  DO UPDATE SET
    required_items_count = v_required_count,
    completed_items_count = v_completed_count,
    is_complete = v_completed_count >= v_required_count,
    is_confirmed = v_is_confirmed,
    last_updated = CURRENT_TIMESTAMP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for progress cache updates
DROP TRIGGER IF EXISTS update_progress_on_response ON form_responses;
CREATE TRIGGER update_progress_on_response
  AFTER INSERT OR UPDATE ON form_responses
  FOR EACH ROW
  WHEN (NEW.is_latest = true)
  EXECUTE FUNCTION update_form_progress_cache();

-- Row Level Security Policies
ALTER TABLE form_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessor_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_update_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_progress_cache ENABLE ROW LEVEL SECURITY;

-- Form instances visible based on course visibility
CREATE POLICY "Users can view form instances for their assigned courses"
  ON form_instances FOR SELECT
  USING (
    course_id IN (
      SELECT course_id FROM course_assignments 
      WHERE user_id = auth.uid()
    )
  );

-- Users can read/write their own responses
CREATE POLICY "Users can manage their own form responses"
  ON form_responses FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Assessors can read all responses for their courses
CREATE POLICY "Assessors can view responses for assessment"
  ON form_responses FOR SELECT
  USING (
    instance_id IN (
      SELECT fi.id FROM form_instances fi
      JOIN course_assignments ca ON fi.course_id = ca.course_id
      WHERE ca.user_id = auth.uid() 
        AND ca.role IN ('assessor', 'trainer', 'admin')
    )
  );

-- Similar policies for other tables...

-- Migration helper: Populate initial data from existing equipment_templates if they exist
DO $$
BEGIN
  -- Check if equipment_templates exists and has data
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'equipment_templates') THEN
    -- Create form instances for existing equipment
    INSERT INTO form_instances (kind, course_id, title, description, requires_assessor_confirmation)
    SELECT DISTINCT 
      'equipment',
      course_id,
      'Equipment Requirements',
      'Equipment required for this course',
      true
    FROM equipment_templates
    ON CONFLICT DO NOTHING;
    
    -- Migrate equipment items
    INSERT INTO form_items (instance_id, stable_id, equipment_name, description, category, required, order_index)
    SELECT 
      fi.id,
      et.id::text,
      et.equipment_name,
      et.description,
      et.category,
      et.required,
      COALESCE(et.order_index, 0)
    FROM equipment_templates et
    JOIN form_instances fi ON et.course_id = fi.course_id
    WHERE fi.kind = 'equipment'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;