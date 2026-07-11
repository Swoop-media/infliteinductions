-- 010: Retake history snapshots + per-user audit log
-- Preserves a user's old completed authorisations/courses when an admin clicks
-- "Retake", and adds a per-user audit trail of admin actions.
-- All three tables are deny-all RLS: only the service-role client reads/writes.

-- Snapshot of a completed authorisation assignment taken just before it is
-- reset for a retake.
create table if not exists public.authorisation_assignment_history (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  user_id uuid not null,
  authorisation_id uuid not null,
  assignment_status text,
  completed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  restrictions text,
  expires_at timestamptz,
  superseded_at timestamptz not null default now(),
  superseded_by uuid,
  reason text not null default 'retake',
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_assignment_history_user
  on public.authorisation_assignment_history (user_id);
create index if not exists idx_auth_assignment_history_user_auth
  on public.authorisation_assignment_history (user_id, authorisation_id, superseded_at desc);

alter table public.authorisation_assignment_history enable row level security;

-- Snapshot of a completed course assignment taken just before it is reset for
-- a retake.
create table if not exists public.course_assignment_history (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  user_id uuid not null,
  course_id uuid not null,
  assignment_status text,
  completed_at timestamptz,
  superseded_at timestamptz not null default now(),
  superseded_by uuid,
  reason text not null default 'retake',
  created_at timestamptz not null default now()
);

create index if not exists idx_course_assignment_history_user
  on public.course_assignment_history (user_id);
create index if not exists idx_course_assignment_history_user_course
  on public.course_assignment_history (user_id, course_id, superseded_at desc);

alter table public.course_assignment_history enable row level security;

-- Per-user audit log of admin actions (profile edits, assignments, retakes,
-- approvals, rejections, revocations, archive/restore, etc).
create table if not exists public.user_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid,
  actor_name text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_audit_log_user_created
  on public.user_audit_log (user_id, created_at desc);

alter table public.user_audit_log enable row level security;
