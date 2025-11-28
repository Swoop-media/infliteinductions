-- =====================================================
-- OPERATIONS NOTICES - Database Migration
-- Run this SQL in your Supabase SQL Editor
-- =====================================================

-- 1. Create the main operations_notices table
CREATE TABLE IF NOT EXISTS operations_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  require_acknowledgement BOOLEAN NOT NULL DEFAULT false,
  responsible_person UUID REFERENCES auth.users(id),
  valid_for_days INTEGER,
  department TEXT,
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create the operations_notice_assignments table (for assigning notices to users)
CREATE TABLE IF NOT EXISTS operations_notice_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES operations_notices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'recipient' CHECK (role IN ('recipient')),
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(notice_id, user_id, role)
);

-- 3. Create the operations_notice_acknowledgements table (for tracking acknowledgements)
CREATE TABLE IF NOT EXISTS operations_notice_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES operations_notices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(notice_id, user_id)
);

-- 4. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_operations_notices_status ON operations_notices(status);
CREATE INDEX IF NOT EXISTS idx_operations_notices_created_by ON operations_notices(created_by);
CREATE INDEX IF NOT EXISTS idx_operations_notices_department ON operations_notices(department);
CREATE INDEX IF NOT EXISTS idx_operations_notices_updated_at ON operations_notices(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_operations_notice_assignments_notice_id ON operations_notice_assignments(notice_id);
CREATE INDEX IF NOT EXISTS idx_operations_notice_assignments_user_id ON operations_notice_assignments(user_id);

CREATE INDEX IF NOT EXISTS idx_operations_notice_acknowledgements_notice_id ON operations_notice_acknowledgements(notice_id);
CREATE INDEX IF NOT EXISTS idx_operations_notice_acknowledgements_user_id ON operations_notice_acknowledgements(user_id);

-- 5. Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_operations_notices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operations_notices_updated_at ON operations_notices;
CREATE TRIGGER trg_operations_notices_updated_at
  BEFORE UPDATE ON operations_notices
  FOR EACH ROW
  EXECUTE FUNCTION update_operations_notices_updated_at();

-- 6. Enable Row Level Security (RLS)
ALTER TABLE operations_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations_notice_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations_notice_acknowledgements ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for operations_notices
-- Note: These policies are permissive. Role-based access control is handled at the application layer
-- (similar to how courses and authorisations work in this codebase)

-- Allow all authenticated users to view notices (published ones, or ones assigned to them)
CREATE POLICY "Users can view published or assigned notices"
  ON operations_notices
  FOR SELECT
  TO authenticated
  USING (
    status = 'published' 
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM operations_notice_assignments 
      WHERE notice_id = operations_notices.id 
      AND user_id = auth.uid()
    )
  );

-- Allow any authenticated user to insert notices (role check done at app layer)
CREATE POLICY "Authenticated users can insert notices"
  ON operations_notices
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow any authenticated user to update notices (role check done at app layer)
CREATE POLICY "Authenticated users can update notices"
  ON operations_notices
  FOR UPDATE
  TO authenticated
  USING (true);

-- Allow any authenticated user to delete notices (role check done at app layer)
CREATE POLICY "Authenticated users can delete notices"
  ON operations_notices
  FOR DELETE
  TO authenticated
  USING (true);

-- 8. RLS Policies for operations_notice_assignments
-- Note: Role-based access control is handled at the application layer

-- Allow users to view their own assignments or all if they are creators
CREATE POLICY "Users can view assignments"
  ON operations_notice_assignments
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow any authenticated user to insert assignments (role check done at app layer)
CREATE POLICY "Authenticated users can insert assignments"
  ON operations_notice_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow any authenticated user to delete assignments (role check done at app layer)
CREATE POLICY "Authenticated users can delete assignments"
  ON operations_notice_assignments
  FOR DELETE
  TO authenticated
  USING (true);

-- 9. RLS Policies for operations_notice_acknowledgements
-- Note: Role-based access control for viewing is handled at the application layer

-- Allow authenticated users to view acknowledgements (for admin/creator views)
CREATE POLICY "Authenticated users can view acknowledgements"
  ON operations_notice_acknowledgements
  FOR SELECT
  TO authenticated
  USING (true);

-- Users can only insert acknowledgements for themselves when assigned to the notice
CREATE POLICY "Users can acknowledge notices assigned to them"
  ON operations_notice_acknowledgements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM operations_notice_assignments
      WHERE notice_id = operations_notice_acknowledgements.notice_id
      AND user_id = auth.uid()
    )
  );

-- =====================================================
-- Migration complete!
-- After running this, your Operations Notices feature
-- will have the database structure it needs.
-- =====================================================
