-- 024: Drop the obsolete module link from quiz_questions.
--
-- All quiz questions are linked by quiz_id (migration 017 backfilled the
-- legacy module-only rows, migration 016 removed orphans) and every learner
-- code path queries by quiz_id only. Keeping quiz_questions.module_id
-- invites future code to write questions linked to a module but not a quiz,
-- which are silently invisible to learners. Dropping the column makes the
-- quiz_id link the only model.
--
-- Step 1 — rewrite the 8 RLS policies that join through module_id, routing
-- them through quiz_id → quizzes → course_modules instead.
-- Step 2 — enforce quiz_id NOT NULL (every row already has it set).
-- Step 3 — drop module_id (and course_id if it exists) from quiz_questions.

-- ---------------------------------------------------------------------------
-- quiz_questions policies
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
      )
  )
);

drop policy if exists "quiz_questions insert" on public.quiz_questions;
create policy "quiz_questions insert"
on public.quiz_questions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.quizzes qz
    join public.course_modules m on m.id = qz.module_id
    join public.courses c on c.id = m.course_id
    where qz.id = quiz_questions.quiz_id
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
    from public.quizzes qz
    join public.course_modules m on m.id = qz.module_id
    join public.courses c on c.id = m.course_id
    where qz.id = quiz_questions.quiz_id
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
    from public.quizzes qz
    join public.course_modules m on m.id = qz.module_id
    join public.courses c on c.id = m.course_id
    where qz.id = quiz_questions.quiz_id
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
    from public.quizzes qz
    join public.course_modules m on m.id = qz.module_id
    join public.courses c on c.id = m.course_id
    where qz.id = quiz_questions.quiz_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

-- ---------------------------------------------------------------------------
-- quiz_options policies (join quiz_questions → quizzes → course_modules)
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
    from public.quiz_questions qq
    join public.quizzes qz on qz.id = qq.quiz_id
    join public.course_modules m on m.id = qz.module_id
    join public.courses c on c.id = m.course_id
    where qq.id = quiz_options.question_id
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
    from public.quiz_questions qq
    join public.quizzes qz on qz.id = qq.quiz_id
    join public.course_modules m on m.id = qz.module_id
    join public.courses c on c.id = m.course_id
    where qq.id = quiz_options.question_id
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
    from public.quiz_questions qq
    join public.quizzes qz on qz.id = qq.quiz_id
    join public.course_modules m on m.id = qz.module_id
    join public.courses c on c.id = m.course_id
    where qq.id = quiz_options.question_id
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
    from public.quiz_questions qq
    join public.quizzes qz on qz.id = qq.quiz_id
    join public.course_modules m on m.id = qz.module_id
    join public.courses c on c.id = m.course_id
    where qq.id = quiz_options.question_id
      and (
        c.created_by = auth.uid()
        or public.app_has_role(auth.uid(), 'Admin')
        or public.app_has_role(auth.uid(), 'Senior management')
      )
  )
);

-- ---------------------------------------------------------------------------
-- Drop the column (policies no longer reference it)
-- ---------------------------------------------------------------------------

ALTER TABLE quiz_questions ALTER COLUMN quiz_id SET NOT NULL;
ALTER TABLE quiz_questions DROP COLUMN IF EXISTS module_id;
ALTER TABLE quiz_questions DROP COLUMN IF EXISTS course_id;

-- Reload PostgREST schema cache so the API stops advertising the old columns.
NOTIFY pgrst, 'reload schema';
