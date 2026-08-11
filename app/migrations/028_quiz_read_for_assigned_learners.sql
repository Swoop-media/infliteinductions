-- 028: Let learners who are ASSIGNED to a course read its quiz content even
-- when the course is not published.
--
-- Symptom (reported 2026-08-11, after 027): learners still saw
-- "Quiz Ready, No Questions" on some courses. Those courses have
-- status = 'draft' but have trainees actively assigned (e.g. "INFLITE SMS
-- Fundamentals", "Reporting Training"). The read policies from 024/027 only
-- allow quiz content on PUBLISHED courses (or creator/Admin/Senior
-- management), so assigned learners on draft courses get zero rows.
--
-- Fix: recreate the read policies on quizzes, quiz_questions and
-- quiz_options with one extra arm: the caller has a row in
-- course_assignments for that course.

-- ---------------------------------------------------------------------------
-- quizzes
-- ---------------------------------------------------------------------------
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
        or exists (
          select 1 from public.course_assignments ca
          where ca.course_id = c.id and ca.user_id = auth.uid()
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- quiz_questions
-- ---------------------------------------------------------------------------
drop policy if exists "quiz_questions read" on public.quiz_questions;
create policy "quiz_questions read"
on public.quiz_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.quizzes qz
    join public.course_modules m on m.id = qz.module_id
    join public.courses c on c.id = m.course_id
    where qz.id = quiz_questions.quiz_id
      and (
        c.status::text = 'published'
        or c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
        or exists (
          select 1 from public.course_assignments ca
          where ca.course_id = c.id and ca.user_id = auth.uid()
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- quiz_options
-- ---------------------------------------------------------------------------
drop policy if exists "quiz_options read" on public.quiz_options;
create policy "quiz_options read"
on public.quiz_options
for select
to authenticated
using (
  exists (
    select 1
    from public.quiz_questions qq
    join public.quizzes qz on qz.id = qq.quiz_id
    join public.course_modules m on m.id = qz.module_id
    join public.courses c on c.id = m.course_id
    where qq.id = quiz_options.question_id
      and (
        c.status::text = 'published'
        or c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
        or exists (
          select 1 from public.course_assignments ca
          where ca.course_id = c.id and ca.user_id = auth.uid()
        )
      )
  )
);
