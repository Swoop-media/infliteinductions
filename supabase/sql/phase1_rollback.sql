-- Phase 1 Rollback Script
-- WARNING: This will drop tables & columns — all Phase 1 data will be lost.

drop trigger if exists trg_course_assignment_enrol on public.course_assignments;
drop function if exists public.trg_course_assignment_enrol();

drop table if exists public.quiz_answers cascade;
drop table if exists public.quiz_options cascade;
drop table if exists public.quiz_questions cascade;
drop table if exists public.module_content_blocks cascade;
drop table if exists public.course_modules cascade;
drop table if exists public.course_assignments cascade;
drop table if exists public.enrolments cascade;

alter table public.courses drop column if exists created_by;
alter table public.courses drop column if exists status;

drop function if exists public.app_has_role(uuid, text);

drop type if exists course_stage;
