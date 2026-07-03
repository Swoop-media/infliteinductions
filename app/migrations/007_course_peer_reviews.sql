-- Migration: Create course_peer_reviews table
-- Date: 2026-07-03
-- Description: Stores peer review sign-offs for courses. A reviewer walks through
--              the entire course in review mode (all modules unlocked, nothing saved
--              to learner progress) and then records who reviewed it, when, and any
--              notes. History is append-only.

CREATE TABLE IF NOT EXISTS course_peer_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewer_name TEXT,
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_peer_reviews_course_id
  ON course_peer_reviews(course_id);

-- Access is performed exclusively through the Supabase admin (service role) client
-- in server routes/pages, so enable RLS with no public policies to deny direct
-- client access by default.
ALTER TABLE course_peer_reviews ENABLE ROW LEVEL SECURITY;
