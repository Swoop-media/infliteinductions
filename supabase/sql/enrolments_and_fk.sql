-- =========================================================
-- Create enrolments table (if missing) + RLS + hook up FK
-- =========================================================

-- 1) Enrolments table
create table if not exists public.enrolments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending','approved','rejected')) default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (course_id, user_id)
);

-- helpful indexes
create index if not exists idx_enrolments_course on public.enrolments(course_id);
create index if not exists idx_enrolments_user   on public.enrolments(user_id);
create index if not exists idx_enrolments_status on public.enrolments(status);

-- 2) RLS: keep it practical and secure
alter table public.enrolments enable row level security;

-- a) Learner can insert their own pending enrolment
drop policy if exists "learner create pending enrolment" on public.enrolments;
create policy "learner create pending enrolment"
on public.enrolments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
);

-- b) Learner can read their own enrolments
drop policy if exists "learner read own enrolments" on public.enrolments;
create policy "learner read own enrolments"
on public.enrolments
for select
to authenticated
using (user_id = auth.uid());

-- c) Admin / Senior management can read all
drop policy if exists "admin read all enrolments" on public.enrolments;
create policy "admin read all enrolments"
on public.enrolments
for select
to authenticated
using (
  public.app_has_role(auth.uid(), 'Admin')
  or public.app_has_role(auth.uid(), 'Senior management')
);

-- d) Admin / Senior management can approve/reject
drop policy if exists "admin manage enrolments" on public.enrolments;
create policy "admin manage enrolments"
on public.enrolments
for update
to authenticated
using (
  public.app_has_role(auth.uid(), 'Admin')
  or public.app_has_role(auth.uid(), 'Senior management')
)
with check (
  public.app_has_role(auth.uid(), 'Admin')
  or public.app_has_role(auth.uid(), 'Senior management')
);

-- (Optional) Course creators can read enrolments for their courses
-- Uncomment if/when you have a creators-to-course link table to enforce it safely.
-- drop policy if exists "creators read course enrolments" on public.enrolments;
-- create policy "creators read course enrolments"
-- on public.enrolments
-- for select
-- to authenticated
-- using (public.app_has_role(auth.uid(), 'Course creators'));

-- 3) Ensure assessor_submissions has the NZ spelling and FK to enrolments

-- add/rename column if needed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='assessor_submissions' and column_name='enrollment_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='assessor_submissions' and column_name='enrolment_id'
  ) then
    execute 'alter table public.assessor_submissions rename column enrollment_id to enrolment_id';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='assessor_submissions' and column_name='enrolment_id'
  ) then
    execute 'alter table public.assessor_submissions add column enrolment_id uuid';
  end if;
end
$$;

-- drop any old FK constraint that might clash
do $$
begin
  begin
    alter table public.assessor_submissions drop constraint if exists assessor_submissions_enrolment_fkey;
  exception when others then
    null;
  end;
end
$$;

-- add the correct FK
alter table public.assessor_submissions
  add constraint assessor_submissions_enrolment_fkey
  foreign key (enrolment_id)
  references public.enrolments(id)
  on delete cascade;

-- index for performance
create index if not exists idx_assessor_submissions_enrolment
  on public.assessor_submissions(enrolment_id);
