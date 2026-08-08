---
name: quiz_questions is quiz_id-only
description: Quiz questions link by quiz_id only; dropping a live column needs a sweep of dependent DB objects
---
Quiz questions are linked to quizzes by `quiz_id` only (NOT NULL); the old module/course links on questions were removed. Never reintroduce module- or course-based fallbacks when reading or writing quiz questions — module-linked questions were invisible to learners.

**Why:** dropping the live column broke in three waves: RLS policies joining through it blocked the DROP (loudly); a live-only trigger not present in repo SQL made every insert fail at runtime (`record "new" has no field ...`); and a SECURITY DEFINER RPC still updated by the old column. Repo bootstrap SQL also had to be updated so fresh databases can't recreate the old model.

**How to apply:** when dropping a column from the live Supabase DB, sweep beyond app code: pg_policies, triggers, and functions — a dynamic DO block that drops triggers whose `prosrc` matches the table+column beats asking the user to run diagnostics. Also update the committed bootstrap/maintenance SQL, and verify afterwards with a service-role PostgREST insert/delete probe.
