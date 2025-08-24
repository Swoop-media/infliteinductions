# SQL Cheatsheet — Phase 1 (Course Creation) + Phase 2 Prep

This doc collects the exact, copy‑pasteable SQL snippets we used (and a few that are safe to re‑run). All snippets are **idempotent** where possible.

> Tip: Run snippets in the Supabase SQL editor. If a snippet references an enum value that doesn’t exist, use the Enum Helpers section first.

---

## 0) Helper: Role checker (safe to re-run)

```sql
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

comment on function public.app_has_role(uuid, text) is
'Checks membership in user_roles via role/role_name or roles join.';


Phase 1 — Course Creation System (Schema, Policies, Rollback)
1. Overview

This document covers the database schema changes, RLS policies, and rollback scripts required to implement Phase 1 of the course creation system.

2. Features Implemented in Phase 1

Course model updates

Owner tracking (created_by)

status column with allowed values draft, in_review, published, archived

RLS: Public can view published; owners/Admin/SM can view all

Unified Module System

course_modules table with type, stage, order_index, config

Types: digital_training, digital_assessment_quiz, onsite_training, onsite_assessment

RLS: Owners/Admin/SM can CRUD, others read only if published

Module Content Blocks

Flexible kind (rich_text, file, video_embed, link)

RLS matches parent course

Quiz System

quiz_questions, quiz_options, quiz_answers

RLS: Creator/Admin/SM can edit questions/options, users can only answer their own

Assignments & Enrolments

course_assignments for trainee, onsite_trainer, onsite_assessor

Trigger to auto-create pending enrolment when assigning a trainee

Notifications integration if table exists

3. Run Order in Supabase SQL Editor

Run these scripts in order:

Enums & helper functions

Course schema changes

Modules & content blocks

Quiz schema

Assignments & enrolments

Triggers

RLS policies

Column fixes (stage, config, order_index, created_at backfills)

Casting fixes (course_status enums → text where needed)

4. Gotchas We Fixed

Missing config column → added jsonb not null default '{}'

order_index missing → added int not null default 0

stage not null constraint → added with enum type and default 'draft'

created_at missing → added for ordering modules

Enum comparison errors → explicitly cast to ::text in RLS where needed

Foreign key issues → ensured all parent tables exist before creating child tables

5. Rollback (Selective)

You can run this to undo Phase 1 while keeping unrelated schema intact.

-- Drop triggers
drop trigger if exists trg_course_assignment_enrol on public.course_assignments;
drop function if exists public.trg_course_assignment_enrol();

-- Drop tables in reverse order
drop table if exists public.quiz_answers cascade;
drop table if exists public.quiz_options cascade;
drop table if exists public.quiz_questions cascade;
drop table if exists public.module_content_blocks cascade;
drop table if exists public.course_modules cascade;
drop table if exists public.course_assignments cascade;
drop table if exists public.enrolments cascade;

-- Remove columns from courses
alter table public.courses drop column if exists created_by;
alter table public.courses drop column if exists status;

-- Drop helper functions
drop function if exists public.app_has_role(uuid, text);

6. Testing

After running Phase 1:

Create a course as a creator and verify it’s in draft status

Add a digital_training module and confirm it stores properly

Add a rich_text block and confirm RLS allows only authorized edits

Assign a trainee → check enrolments for pending status and notification