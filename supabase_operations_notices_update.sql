-- =====================================================
-- OPERATIONS NOTICES - Add Responsible Person and Valid For Days
-- Run this SQL in your Supabase SQL Editor
-- =====================================================

-- Add responsible_person column (references profiles table for user lookup)
ALTER TABLE operations_notices 
ADD COLUMN IF NOT EXISTS responsible_person UUID REFERENCES auth.users(id);

-- Add valid_for_days column (number of days the notice is valid for)
ALTER TABLE operations_notices 
ADD COLUMN IF NOT EXISTS valid_for_days INTEGER;

-- Add index for responsible_person for faster lookups
CREATE INDEX IF NOT EXISTS idx_operations_notices_responsible_person 
ON operations_notices(responsible_person);

-- =====================================================
-- Migration complete!
-- The operations_notices table now has:
-- - responsible_person: UUID of the person responsible for this notice
-- - valid_for_days: Number of days the notice is valid (null = no expiry)
-- =====================================================
