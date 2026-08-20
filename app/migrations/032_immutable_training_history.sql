-- 032: Immutable course versions and learner training records
--
-- Important baseline limitation:
-- Historical content that was edited or deleted before this migration cannot be
-- reconstructed. Existing rows are therefore labelled baseline_backfill or
-- legacy_backfill. Every completion created after this migration is exact.

create table if not exists public.course_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  title text not null,
  description text,
  snapshot jsonb not null,
  status text not null default 'published'
    check (status in ('publishing', 'published', 'superseded')),
  change_notes text,
  published_at timestamptz not null default now(),
  published_by uuid,
  created_at timestamptz not null default now(),
  unique (course_id, version_number)
);

create index if not exists idx_course_versions_course_published
  on public.course_versions (course_id, version_number desc);

alter table public.course_versions enable row level security;

alter table public.courses
  add column if not exists current_version_number integer not null default 1;

alter table public.course_assignments
  add column if not exists course_version_id uuid
    references public.course_versions(id) on delete restrict,
  add column if not exists attempt_number integer not null default 1
    check (attempt_number > 0);

alter table public.quiz_attempts
  add column if not exists assignment_id uuid
    references public.course_assignments(id) on delete restrict,
  add column if not exists course_version_id uuid
    references public.course_versions(id) on delete restrict,
  add column if not exists attempt_number integer,
  add column if not exists question_snapshot jsonb;

alter table public.course_assignment_history
  add column if not exists course_version_id uuid
    references public.course_versions(id) on delete restrict,
  add column if not exists course_version_number integer,
  add column if not exists attempt_number integer,
  add column if not exists course_title text,
  add column if not exists snapshot jsonb,
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists snapshot_source text not null default 'exact';

create unique index if not exists uq_course_history_attempt
  on public.course_assignment_history
    (assignment_id, course_version_id, attempt_number);

create index if not exists idx_course_history_user_completed
  on public.course_assignment_history (user_id, completed_at desc);

alter table public.authorisation_assignment_history
  add column if not exists authorisation_title text,
  add column if not exists snapshot jsonb,
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists attempt_number integer,
  add column if not exists snapshot_source text not null default 'legacy_backfill';

alter table public.authorisation_assignments
  add column if not exists attempt_number integer not null default 1
    check (attempt_number > 0),
  add column if not exists expires_at timestamptz;

create unique index if not exists uq_authorisation_history_attempt
  on public.authorisation_assignment_history (assignment_id, attempt_number);

create index if not exists idx_authorisation_history_user_completed
  on public.authorisation_assignment_history (user_id, completed_at desc);

create or replace function public.capture_authorisation_snapshot(p_authorisation_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'captured_at', now(),
    'authorisation', to_jsonb(a),
    'required_courses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'link', to_jsonb(ac),
          'course_id', c.id,
          'course_title', c.title,
          'course_version_number', c.current_version_number,
          'course_version_id', cv.id
        )
        order by ac.order_index
      )
      from public.authorisation_courses ac
      join public.courses c on c.id = ac.course_id
      left join public.course_versions cv
        on cv.course_id = c.id
       and cv.version_number = c.current_version_number
      where ac.authorisation_id = a.id
    ), '[]'::jsonb)
  )
  from public.authorisations a
  where a.id = p_authorisation_id;
$$;

revoke all on function public.capture_authorisation_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.capture_authorisation_snapshot(uuid)
  to service_role;

-- Returns the complete mutable course definition as one immutable JSON value.
-- The learner-specific evidence is stored separately on course history rows.
create or replace function public.capture_course_version_snapshot(p_course_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'captured_at', now(),
    'course', to_jsonb(c),
    'equipment_templates', coalesce((
      select jsonb_agg(to_jsonb(et) order by et.order_index, et.created_at)
      from public.equipment_templates et
      where et.course_id = c.id
    ), '[]'::jsonb),
    'authorisations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'link', to_jsonb(ac),
          'authorisation', to_jsonb(a)
        )
        order by ac.order_index
      )
      from public.authorisation_courses ac
      join public.authorisations a on a.id = ac.authorisation_id
      where ac.course_id = c.id
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object(
          'content_blocks', coalesce((
            select jsonb_agg(to_jsonb(cb) order by cb.order_index, cb.created_at)
            from public.module_content_blocks cb
            where cb.module_id = m.id
          ), '[]'::jsonb),
          'onsite_requirements', coalesce((
            select jsonb_agg(to_jsonb(r) order by r.order_index, r.created_at)
            from public.onsite_requirements r
            where r.module_id = m.id
          ), '[]'::jsonb),
          'quizzes', coalesce((
            select jsonb_agg(
              to_jsonb(q) || jsonb_build_object(
                'questions', coalesce((
                  select jsonb_agg(
                    to_jsonb(qq) || jsonb_build_object(
                      'options', coalesce((
                        select jsonb_agg(to_jsonb(qo) order by qo.id)
                        from public.quiz_options qo
                        where qo.question_id = qq.id
                      ), '[]'::jsonb)
                    )
                    order by qq.order_index, qq.created_at
                  )
                  from public.quiz_questions qq
                  where qq.quiz_id = q.id
                ), '[]'::jsonb)
              )
              order by q.id
            )
            from public.quizzes q
            where q.module_id = m.id
          ), '[]'::jsonb)
        )
        order by m.order_index, m.created_at
      )
      from public.course_modules m
      where m.course_id = c.id
    ), '[]'::jsonb)
  )
  from public.courses c
  where c.id = p_course_id;
$$;

revoke all on function public.capture_course_version_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.capture_course_version_snapshot(uuid)
  to service_role;

-- Capture version 1 for every existing course at migration time.
insert into public.course_versions (
  course_id,
  version_number,
  title,
  description,
  snapshot,
  status,
  change_notes,
  published_at
)
select
  c.id,
  1,
  coalesce(c.title, 'Untitled course'),
  c.description,
  public.capture_course_version_snapshot(c.id),
  'published',
  'Baseline captured when immutable training history was enabled',
  coalesce(c.updated_at, c.created_at, now())
from public.courses c
on conflict (course_id, version_number) do nothing;

update public.course_assignments ca
set course_version_id = cv.id
from public.course_versions cv
where cv.course_id = ca.course_id
  and cv.version_number = 1
  and ca.course_version_id is null;

-- Every new trainee assignment is pinned to the course's currently released
-- version, regardless of which legacy assignment route created it.
create or replace function public.set_course_assignment_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'trainee' and new.course_version_id is null then
    select cv.id
    into new.course_version_id
    from public.course_versions cv
    join public.courses c on c.id = cv.course_id
    where cv.course_id = new.course_id
      and cv.version_number = c.current_version_number
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_course_assignment_version
  on public.course_assignments;
create trigger trg_set_course_assignment_version
before insert on public.course_assignments
for each row execute function public.set_course_assignment_version();

-- Preserve the sequence of already-recorded retakes. Their original content is
-- unknowable, so attach the migration-time baseline and label it honestly.
with numbered as (
  select
    h.id,
    cv.id as version_id,
    cv.snapshot,
    cv.title,
    row_number() over (
      partition by h.assignment_id
      order by h.completed_at nulls last, h.superseded_at, h.created_at, h.id
    )::integer as attempt_no
  from public.course_assignment_history h
  join public.course_versions cv
    on cv.course_id = h.course_id and cv.version_number = 1
)
update public.course_assignment_history h
set
  course_version_id = n.version_id,
  course_version_number = 1,
  attempt_number = n.attempt_no,
  course_title = n.title,
  snapshot = n.snapshot,
  snapshot_source = 'legacy_backfill'
from numbered n
where h.id = n.id
  and h.course_version_id is null;

-- Live assignments continue at the next attempt number after any old retakes.
update public.course_assignments ca
set attempt_number = greatest(
  ca.attempt_number,
  1 + (
    select count(*)::integer
    from public.course_assignment_history h
    where h.assignment_id = ca.id
  )
);

-- Add every currently-completed assignment to immutable history. Evidence is
-- reconstructed from the rows still available today.
insert into public.course_assignment_history (
  assignment_id,
  user_id,
  course_id,
  assignment_status,
  completed_at,
  superseded_at,
  reason,
  course_version_id,
  course_version_number,
  attempt_number,
  course_title,
  snapshot,
  evidence,
  snapshot_source
)
select
  ca.id,
  ca.user_id,
  ca.course_id,
  ca.assignment_status,
  ca.completed_at,
  now(),
  'completion',
  ca.course_version_id,
  cv.version_number,
  ca.attempt_number,
  cv.title,
  cv.snapshot,
  jsonb_build_object(
    'assignment_progress', coalesce((
      select jsonb_agg(to_jsonb(ap) order by ap.completed_at)
      from public.assignment_progress ap
      where ap.assignment_id = ca.id
    ), '[]'::jsonb),
    'quiz_attempts', coalesce((
      select jsonb_agg(to_jsonb(qa) order by qa.created_at)
      from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      join public.course_modules m on m.id = q.module_id
      where qa.user_id = ca.user_id and m.course_id = ca.course_id
    ), '[]'::jsonb),
    'requirement_responses', coalesce((
      select jsonb_agg(to_jsonb(rr))
      from public.requirement_responses rr
      where rr.assignment_id = ca.id
    ), '[]'::jsonb),
    'trainee_equipment_responses', coalesce((
      select jsonb_agg(to_jsonb(ter))
      from public.trainee_equipment_responses ter
      where ter.user_id = ca.user_id and ter.course_id = ca.course_id
    ), '[]'::jsonb),
    'equipment_assessments', coalesce((
      select jsonb_agg(to_jsonb(ea))
      from public.equipment_assessments ea
      where ea.trainee_id = ca.user_id and ea.course_id = ca.course_id
    ), '[]'::jsonb),
    'learner_documents', coalesce((
      select jsonb_agg(to_jsonb(ld) order by ld.created_at)
      from public.learner_documents ld
      where ld.user_id = ca.user_id and ld.course_id = ca.course_id
    ), '[]'::jsonb)
  ),
  'baseline_backfill'
from public.course_assignments ca
join public.course_versions cv on cv.id = ca.course_version_id
where ca.role = 'trainee'
  and ca.assignment_status = 'completed'
  and ca.completed_at is not null
on conflict (assignment_id, course_version_id, attempt_number) do nothing;

-- Legacy quiz attempts remain unlinked. A reusable assignment row may have
-- represented several historical retakes, so current assignment state cannot
-- prove which version/attempt produced an old row. New attempts are always
-- tagged by the application with assignment, release and attempt identity.

-- Baseline legacy authorisation retakes using the definition still available
-- today, then append every currently-completed live authorisation.
with numbered as (
  select
    h.id,
    row_number() over (
      partition by h.assignment_id
      order by h.completed_at nulls last, h.superseded_at, h.created_at, h.id
    )::integer as attempt_no,
    a.title,
    public.capture_authorisation_snapshot(h.authorisation_id) as auth_snapshot
  from public.authorisation_assignment_history h
  join public.authorisations a on a.id = h.authorisation_id
)
update public.authorisation_assignment_history h
set
  attempt_number = n.attempt_no,
  authorisation_title = n.title,
  snapshot = n.auth_snapshot,
  snapshot_source = 'legacy_backfill'
from numbered n
where h.id = n.id
  and h.attempt_number is null;

update public.authorisation_assignments aa
set attempt_number = greatest(
  aa.attempt_number,
  1 + (
    select count(*)::integer
    from public.authorisation_assignment_history h
    where h.assignment_id = aa.id
  )
);

-- Freeze the expiry that the existing application would calculate for each
-- currently-approved authorisation. This is a baseline reconstruction only;
-- future approvals store their exact calculated expiry directly.
update public.authorisation_assignments aa
set expires_at = (
  select min(candidate.expires_at)
  from (
    select
      coalesce(aa.approved_at, aa.completed_at, now())
        + make_interval(days => a.valid_for_days) as expires_at
    from public.authorisations a
    where a.id = aa.authorisation_id
      and a.valid_for_days is not null
      and a.valid_for_days > 0

    union all

    select ld.expires_on::timestamptz
    from public.learner_documents ld
    join public.authorisation_courses ac
      on ac.course_id = ld.course_id
     and ac.authorisation_id = aa.authorisation_id
    where ld.user_id = aa.user_id
      and ld.expires_on is not null
      and ld.expires_on > coalesce(aa.approved_at, aa.completed_at, now())::date
      and (ld.status is null or ld.status <> 'replaced')

    union all

    select
      coalesce(aa.approved_at, aa.completed_at, now())
        + make_interval(months => c.valid_for_months) as expires_at
    from public.authorisation_courses ac
    join public.courses c on c.id = ac.course_id
    join public.course_assignments ca
      on ca.course_id = c.id
     and ca.user_id = aa.user_id
     and ca.role = 'trainee'
     and ca.completed_at is not null
    where ac.authorisation_id = aa.authorisation_id
      and c.valid_for_months is not null
      and c.valid_for_months > 0
  ) candidate
)
where aa.role = 'trainee'
  and aa.assignment_status = 'completed'
  and aa.expires_at is null;

insert into public.authorisation_assignment_history (
  assignment_id,
  user_id,
  authorisation_id,
  assignment_status,
  completed_at,
  approved_at,
  approved_by,
  restrictions,
  expires_at,
  superseded_at,
  reason,
  authorisation_title,
  snapshot,
  evidence,
  attempt_number,
  snapshot_source
)
select
  aa.id,
  aa.user_id,
  aa.authorisation_id,
  aa.assignment_status,
  aa.completed_at,
  aa.approved_at,
  aa.approved_by,
  aa.restrictions,
  aa.expires_at,
  now(),
  'completion',
  a.title,
  public.capture_authorisation_snapshot(aa.authorisation_id),
  jsonb_build_object(
    'course_completion_records', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'history_id', h.id,
          'course_id', h.course_id,
          'course_title', h.course_title,
          'course_version_number', h.course_version_number,
          'attempt_number', h.attempt_number,
          'completed_at', h.completed_at
        )
        order by h.completed_at
      )
      from public.course_assignment_history h
      join public.authorisation_courses ac
        on ac.course_id = h.course_id
       and ac.authorisation_id = aa.authorisation_id
      where h.user_id = aa.user_id
        and h.completed_at <= coalesce(aa.approved_at, aa.completed_at, now())
    ), '[]'::jsonb)
  ),
  aa.attempt_number,
  'baseline_backfill'
from public.authorisation_assignments aa
join public.authorisations a on a.id = aa.authorisation_id
where aa.role = 'trainee'
  and aa.assignment_status = 'completed'
on conflict (assignment_id, attempt_number) do nothing;

-- Enforce append-only evidence at the database boundary. Application code uses
-- the service role in several places, so RLS alone is not an immutability guard.
create or replace function public.reject_immutable_training_record_mutation()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  raise exception '% records are append-only and cannot be %',
    tg_table_name,
    lower(tg_op);
end;
$$;

drop trigger if exists course_history_append_only on public.course_assignment_history;
create trigger course_history_append_only
before update or delete on public.course_assignment_history
for each row execute function public.reject_immutable_training_record_mutation();

drop trigger if exists authorisation_history_append_only on public.authorisation_assignment_history;
create trigger authorisation_history_append_only
before update or delete on public.authorisation_assignment_history
for each row execute function public.reject_immutable_training_record_mutation();

drop trigger if exists quiz_attempts_append_only on public.quiz_attempts;
create trigger quiz_attempts_append_only
before update or delete on public.quiz_attempts
for each row execute function public.reject_immutable_training_record_mutation();

create or replace function public.protect_published_course_version()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Course versions cannot be deleted';
  end if;

  if new.id is distinct from old.id
    or new.course_id is distinct from old.course_id
    or new.version_number is distinct from old.version_number
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.snapshot is distinct from old.snapshot
    or new.change_notes is distinct from old.change_notes
    or new.published_at is distinct from old.published_at
    or new.published_by is distinct from old.published_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Course version definitions are immutable';
  end if;

  if new.status = old.status
    or (old.status = 'publishing' and new.status = 'published')
    or (old.status = 'published' and new.status = 'superseded')
  then
    return new;
  end if;

  raise exception 'Invalid course version status transition: % to %',
    old.status,
    new.status;
end;
$$;

drop trigger if exists protect_published_course_version on public.course_versions;
create trigger protect_published_course_version
before update or delete on public.course_versions
for each row execute function public.protect_published_course_version();

notify pgrst, 'reload schema';
