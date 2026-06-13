-- Migration: Add safeflite_risk_ids column to courses
-- Date: 2026-06-13
-- Description: Persist the SafeFLITE risk UUIDs that each course mitigates.
--              Course authors pick these in the course editor Details tab and the
--              selection is synced to SafeFLITE via the upsert-training-control
--              edge function. Stored as a text array of SafeFLITE risk UUIDs.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS safeflite_risk_ids TEXT[] NOT NULL DEFAULT '{}';
