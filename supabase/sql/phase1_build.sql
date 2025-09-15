-- =========================================================
-- Phase 1 Build Script — Course Creation Schema & RLS
-- =========================================================
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS
-- =========================================================

-- 0) Helper: role check
create or replace function public.app_has_role(u uuid, wanted text)
returns boolean
language plpgsql
stable
as $$
declare
  has_col_role boolean;
  has_col_role_name boolean;
  has_col_role_id boolean;
  has_roles_table boolean;
  ok boolean := false;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_roles' and column_name='role'
  ) into has_col_role;

  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_roles' and column_name='role_name'
  ) into has_col_role_name;

  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_roles' and column_name='role_id'
  ) into has_col_role_id;

  select exists(
    select 1 from information_schema.tables
    where table_schema='public' and table_name='roles'
  ) into has_roles_table;

  if has_col_role then
    select exists(select 1 from public.user_roles ur where ur.user_id=u and ur.role=wanted) into ok;
    return ok;
  elsif has_col_role_name then
    select exists(select 1 from public.user_roles ur where ur.user_id=u and ur.role_name=wanted) into ok;
    return ok;
  elsif has_col_role_id and has_roles_table then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='roles' and column_name='name') then
      select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=u and r.name=wanted) into ok;
      return ok;
    elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='roles' and column_name='role') then
      select exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=u and r.role=wanted) into ok;
      return ok;
    else
      return false;
    end if;
  else
    return false;
  end if;
end
$$;

-- =========================================================
-- 1) COURSES: owner + status
-- =========================================================
alter table public.courses
  add column if not exists created_by uuid references auth.users(id);

alter table public.courses
  add column if not exists status text
    check (status in ('draft','in_review','published','archived'))
    default 'draft' not null;

alter table public.courses enable row level security;

drop policy if exists "courses read" on public.courses;
create policy "courses read"
on public.courses
for select
to authenticated
using (
  status::text = 'published'
  or created_by = auth.uid()
  or public.app_has_role(auth.uid(), 'Admin')
  or public.app_has_role(auth.uid(), 'Senior management')
);

drop policy if exists "courses insert" on public.courses;
create policy "courses insert"
on public.courses
for insert
to authenticated
with check (
  created_by = auth.uid()
  or public.app_has_role(auth.uid(), 'Admin')
  or public.app_has_role(auth.uid(), 'Senior management')
);

drop policy if exists "courses update" on public.courses;
create policy "courses update"
on public.courses
for update
to authenticated
using (
  created_by = auth.uid()
  or public.app_has_role(auth.uid(), 'Admin')
  or public.app_has_role(auth.uid(), 'Senior management')
)
with check (
  created_by = auth.uid()
  or public.app_has_role(auth.uid(), 'Admin')
  or public.app_has_role(auth.uid(), 'Senior management')
);

-- =========================================================
-- 2) COURSE MODULES (unified)
-- =========================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'course_stage') then
    create type public.course_stage as enum ('draft','in_review','published','archived');
  end if;
end$$;

create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  type text not null check (type in ('digital_training','digital_assessment_quiz','onsite_training','onsite_assessment')),
  title text not null,
  order_index int not null default 0,
  config jsonb not null default '{}',
  stage public.course_stage not null default 'draft',
  created_at timestamptz not null default now()
);

create index if not exists idx_course_modules_course on public.course_modules(course_id);
create index if not exists idx_course_modules_type   on public.course_modules(type);

alter table public.course_modules enable row level security;

drop policy if exists "course_modules read" on public.course_modules;
create policy "course_modules read"
on public.course_modules
for select
to authenticated
using (
  exists (
    select 1
    from public.courses c
    where c.id = course_modules.course_id
      and (
        c.status::text = 'published'
        or c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "course_modules insert" on public.course_modules;
create policy "course_modules insert"
on public.course_modules
for insert
to authenticated
with check (
  exists (
    select 1
    from public.courses c
    where c.id = course_modules.course_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "course_modules update" on public.course_modules;
create policy "course_modules update"
on public.course_modules
for update
to authenticated
using (
  exists (
    select 1
    from public.courses c
    where c.id = course_modules.course_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
)
with check (
  exists (
    select 1
    from public.courses c
    where c.id = course_modules.course_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "course_modules delete" on public.course_modules;
create policy "course_modules delete"
on public.course_modules
for delete
to authenticated
using (
  exists (
    select 1
    from public.courses c
    where c.id = course_modules.course_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

-- Optional deterministic ordering backfill (safe to re-run)
with ranked as (
  select id, row_number() over (partition by course_id order by created_at) - 1 as rn
  from public.course_modules
)
update public.course_modules m
set order_index = coalesce(m.order_index, r.rn)
from ranked r
where r.id = m.id;

-- =========================================================
-- 3) MODULE CONTENT BLOCKS
-- =========================================================
create table if not exists public.module_content_blocks (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.course_modules(id) on delete cascade,
  kind text not null check (kind in ('rich_text','file','video_embed','link','request_document','quiz_questions','equipment_form')),
  data jsonb not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_mod_blocks_module on public.module_content_blocks(module_id);

alter table public.module_content_blocks enable row level security;

drop policy if exists "module_content_blocks read" on public.module_content_blocks;
create policy "module_content_blocks read"
on public.module_content_blocks
for select
to authenticated
using (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = module_content_blocks.module_id
      and (
        c.status::text = 'published'
        or c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "module_content_blocks insert" on public.module_content_blocks;
create policy "module_content_blocks insert"
on public.module_content_blocks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = module_content_blocks.module_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "module_content_blocks update" on public.module_content_blocks;
create policy "module_content_blocks update"
on public.module_content_blocks
for update
to authenticated
using (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = module_content_blocks.module_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
)
with check (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = module_content_blocks.module_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "module_content_blocks delete" on public.module_content_blocks;
create policy "module_content_blocks delete"
on public.module_content_blocks
for delete
to authenticated
using (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = module_content_blocks.module_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

-- =========================================================
-- 4) QUIZ TABLES + RLS
-- =========================================================
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.course_modules(id) on delete cascade,
  stem text not null,
  type text not null check (type in ('mcq','multi','true_false','short_text')),
  points int not null default 1,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false
);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  value jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_quiz_q_module  on public.quiz_questions(module_id);
create index if not exists idx_quiz_opt_q     on public.quiz_options(question_id);
create index if not exists idx_quiz_ans_q     on public.quiz_answers(question_id);
create index if not exists idx_quiz_ans_user  on public.quiz_answers(user_id);

alter table public.quiz_questions enable row level security;
alter table public.quiz_options  enable row level security;
alter table public.quiz_answers  enable row level security;

-- Read: questions/options visible when parent course is visible
drop policy if exists "quiz_questions read" on public.quiz_questions;
create policy "quiz_questions read"
on public.quiz_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = quiz_questions.module_id
      and (
        c.status::text = 'published'
        or c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "quiz_options read" on public.quiz_options;
create policy "quiz_options read"
on public.quiz_options
for select
to authenticated
using (
  exists (
    select 1
    from public.quiz_questions q
    join public.course_modules m on m.id = q.module_id
    join public.courses c on c.id = m.course_id
    where q.id = quiz_options.question_id
      and (
        c.status::text = 'published'
        or c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

-- Write: questions/options allowed for course owner/Admin/SM
drop policy if exists "quiz_questions insert" on public.quiz_questions;
create policy "quiz_questions insert"
on public.quiz_questions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = quiz_questions.module_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "quiz_questions update" on public.quiz_questions;
create policy "quiz_questions update"
on public.quiz_questions
for update
to authenticated
using (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = quiz_questions.module_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
)
with check (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = quiz_questions.module_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "quiz_questions delete" on public.quiz_questions;
create policy "quiz_questions delete"
on public.quiz_questions
for delete
to authenticated
using (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = quiz_questions.module_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "quiz_options insert" on public.quiz_options;
create policy "quiz_options insert"
on public.quiz_options
for insert
to authenticated
with check (
  exists (
    select 1
    from public.quiz_questions q
    join public.course_modules m on m.id = q.module_id
    join public.courses c on c.id = m.course_id
    where q.id = quiz_options.question_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "quiz_options update" on public.quiz_options;
create policy "quiz_options update"
on public.quiz_options
for update
to authenticated
using (
  exists (
    select 1
    from public.quiz_questions q
    join public.course_modules m on m.id = q.module_id
    join public.courses c on c.id = m.course_id
    where q.id = quiz_options.question_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
)
with check (
  exists (
    select 1
    from public.quiz_questions q
    join public.course_modules m on m.id = q.module_id
    join public.courses c on c.id = m.course_id
    where q.id = quiz_options.question_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "quiz_options delete" on public.quiz_options;
create policy "quiz_options delete"
on public.quiz_options
for delete
to authenticated
using (
  exists (
    select 1
    from public.quiz_questions q
    join public.course_modules m on m.id = q.module_id
    join public.courses c on c.id = m.course_id
    where q.id = quiz_options.question_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

-- Answers: users insert/read their own; Admin/SM read all
drop policy if exists "quiz_answers insert own" on public.quiz_answers;
create policy "quiz_answers insert own"
on public.quiz_answers
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "quiz_answers read own" on public.quiz_answers;
create policy "quiz_answers read own"
on public.quiz_answers
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "quiz_answers read admin" on public.quiz_answers;
create policy "quiz_answers read admin"
on public.quiz_answers
for select
to authenticated
using (
  public.app_has_role(auth.uid(), 'Admin')
  or public.app_has_role(auth.uid(), 'Senior management')
);

-- =========================================================
-- 5) ASSIGNMENTS + ENROLMENTS
-- =========================================================
create table if not exists public.course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('trainee','onsite_trainer','onsite_assessor')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (course_id, user_id, role)
);

create index if not exists idx_course_assignments_course on public.course_assignments(course_id);
create index if not exists idx_course_assignments_user   on public.course_assignments(user_id);

alter table public.course_assignments enable row level security;

drop policy if exists "course_assignments read" on public.course_assignments;
create policy "course_assignments read"
on public.course_assignments
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
      select 1 from public.courses c
      where c.id = course_assignments.course_id
        and (
          c.created_by = auth.uid()
          or public.app_has_role(auth.uid(), 'Admin')
          or public.app_has_role(auth.uid(), 'Senior management')
        )
  )
);

drop policy if exists "course_assignments insert" on public.course_assignments;
create policy "course_assignments insert"
on public.course_assignments
for insert
to authenticated
with check (
  exists (
    select 1 from public.courses c
    where c.id = course_assignments.course_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "course_assignments update" on public.course_assignments;
create policy "course_assignments update"
on public.course_assignments
for update
to authenticated
using (
  exists (
    select 1 from public.courses c
    where c.id = course_assignments.course_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
)
with check (
  exists (
    select 1 from public.courses c
    where c.id = course_assignments.course_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

drop policy if exists "course_assignments delete" on public.course_assignments;
create policy "course_assignments delete"
on public.course_assignments
for delete
to authenticated
using (
  exists (
    select 1 from public.courses c
    where c.id = course_assignments.course_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

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

create or replace function public.trg_course_assignment_enrol()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'trainee' then
    insert into public.enrolments (course_id, user_id, status)
    values (new.course_id, new.user_id, 'pending')
    on conflict (course_id, user_id) do nothing;

    -- Optional: in-app notification if notifications table exists
    begin
      if exists (select 1 from information_schema.tables where table_schema='public' and table_name='notifications') then
        insert into public.notifications (recipient_id, type, payload, read)
        values (
          new.user_id,
          'assignment_added',
          jsonb_build_object('course_id', new.course_id),
          false
        );
      end if;
    exception when others then null;
    end;
  end if;
  return new;
end
$$;

drop trigger if exists trg_course_assignment_enrol on public.course_assignments;
create trigger trg_course_assignment_enrol
after insert on public.course_assignments
for each row
execute function public.trg_course_assignment_enrol();

-- Function to automatically update the updated_at column
-- Fixed: Added immutable search_path and SECURITY DEFINER for trigger security
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;