-- 015: Index for retake-snapshot lookups by assignment
--
-- The "prior authorisation stays current during a retake" logic looks up
-- authorisation_assignment_history by assignment_id + reason ordered by
-- superseded_at (admin user page, authorisations report, PDF export,
-- myprofile). The existing index leads with user_id, which doesn't help the
-- cross-user report query.

create index if not exists idx_auth_assignment_history_assignment_retake
  on public.authorisation_assignment_history (assignment_id, reason, superseded_at desc);
