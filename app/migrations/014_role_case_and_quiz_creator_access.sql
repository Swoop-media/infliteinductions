-- 014: Case-insensitive role checks + quiz access for Course Creators
--
-- Problems this fixes (found 2026-08-03 while debugging "Application error"
-- on the creator quiz editor):
--
-- 1) Role-name checks are CASE-SENSITIVE exact matches, but the code and the
--    RLS policies are inconsistent about casing. The live roles table has
--    'Senior Management' and 'Course Creators', while ~36 code call sites and
--    several RLS policies check 'Senior management' / 'Course creators' —
--    those checks silently return false. Redefining has_role/app_has_role to
--    compare case-insensitively fixes every existing call site and policy at
--    once, in both the app and the database.
--
-- 2) The quizzes / quiz_questions / quiz_options RLS policies only allow the
--    course owner, Admin, or Senior management — NOT Course Creators. A
--    course creator loading the quiz editor saw no quiz (RLS-hidden), the
--    page tried to insert a new one and hit uq_quiz_per_course, surfacing as
--    "application error - a server exception has occurred". The permissive
--    policies below grant Course Creators access to quiz content.
--
-- Role names below use canonical casing from the roles table, but thanks to
-- (1) the comparison is case-insensitive anyway.

-- ---------------------------------------------------------------------------
-- 1) Case-insensitive role helpers
-- ---------------------------------------------------------------------------

create or replace function public.app_has_role(u uuid, wanted text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  ok boolean := false;
begin
  select exists(
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = u
      and lower(r.name) = lower(wanted)
  ) into ok;
  return ok;
end;
$$;

-- The app's lib/roles.ts calls has_role(uid, role_name); keep that signature.
create or replace function public.has_role(uid uuid, role_name text)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.app_has_role(uid, role_name);
$$;

-- ---------------------------------------------------------------------------
-- 2) Quiz content access for Course Creators (additive permissive policies)
--    Existing policies for owner/Admin/Senior Management stay in place;
--    permissive policies OR together, so these only ADD access.
-- ---------------------------------------------------------------------------

drop policy if exists "quizzes course creators all" on public.quizzes;
create policy "quizzes course creators all"
on public.quizzes
for all
to authenticated
using (public.app_has_role(auth.uid(), 'Course Creators'))
with check (public.app_has_role(auth.uid(), 'Course Creators'));

drop policy if exists "quiz_questions course creators all" on public.quiz_questions;
create policy "quiz_questions course creators all"
on public.quiz_questions
for all
to authenticated
using (public.app_has_role(auth.uid(), 'Course Creators'))
with check (public.app_has_role(auth.uid(), 'Course Creators'));

drop policy if exists "quiz_options course creators all" on public.quiz_options;
create policy "quiz_options course creators all"
on public.quiz_options
for all
to authenticated
using (public.app_has_role(auth.uid(), 'Course Creators'))
with check (public.app_has_role(auth.uid(), 'Course Creators'));
