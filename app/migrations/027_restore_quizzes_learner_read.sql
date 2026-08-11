-- 027: Restore learner read access to quizzes.
--
-- Symptom (reported 2026-08-11): learners open a quiz and see
-- "Quiz Ready, No Questions" even though the quiz has questions.
--
-- Root cause: the live-DB policy sweep around migrations 024/025 removed the
-- learner SELECT policy on public.quizzes (it referenced the dropped
-- module_id/course_id plumbing). With no learner-readable rows in quizzes:
--   1) the learner quiz fetch returns null (the page then "finds" the quiz
--      via the SECURITY DEFINER RPC ensure_quiz_for_module), and
--   2) the "quiz_questions read" policy from 024 — whose EXISTS subquery
--      joins through public.quizzes under the caller's RLS — matches nothing,
--      so the question fetch returns 0 rows.
-- Creators, Admins and Senior management kept access via their own policies,
-- which is why the problem only shows for regular learners.
--
-- Fix: recreate a SELECT policy on quizzes mirroring the access rules used in
-- migration 024 for quiz_questions: any authenticated user can read quizzes
-- belonging to a published course; creators/Admin/Senior management can read
-- the rest.

drop policy if exists "quizzes read" on public.quizzes;
create policy "quizzes read"
on public.quizzes
for select
to authenticated
using (
  exists (
    select 1
    from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = quizzes.module_id
      and (
        c.status::text = 'published'
        or c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);
