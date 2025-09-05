
-- Debug quiz_questions table structure and constraints
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'quiz_questions'
ORDER BY ordinal_position;

-- Check constraints on quiz_questions table
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.quiz_questions'::regclass;

-- Check if there are any existing quiz questions
SELECT COUNT(*) as total_questions FROM quiz_questions;

-- Sample a few quiz questions to see the actual data
SELECT 
  id,
  module_id,
  stem,
  type,
  points,
  order_index,
  created_at
FROM quiz_questions 
ORDER BY created_at DESC
LIMIT 5;

-- Check what quiz question types are actually in the database
SELECT 
  type,
  COUNT(*) as count
FROM quiz_questions 
GROUP BY type
ORDER BY count DESC;
