-- 034: Per-user read tracking for published release notes
--
-- Each authenticated user can record that they have read a published release
-- note. The table is keyed by (release_note_id, user_id) so a user can only
-- mark each note once. read_published_at records the exact published_at
-- version of the note that was read; a changed published_at (re-publish after
-- an archived round-trip) resets the unread counter for every user.
--
-- RLS restricts every operation to the row owner, and read receipts are only
-- accepted for published release notes whose current published_at matches the
-- supplied read_published_at. Three SECURITY INVOKER SQL RPCs provide the
-- atomic snapshot-load, count-unread, and mark-read surface used by the
-- application.

create table if not exists public.release_note_reads (
  release_note_id  uuid        not null references public.release_notes(id) on delete cascade,
  user_id          uuid        not null references auth.users(id)           on delete cascade,
  read_at          timestamptz not null default now(),
  read_published_at timestamptz not null,
  primary key (release_note_id, user_id)
);

-- Idempotent column additions for environments where the table was created
-- without read_published_at by a prior run of this migration.
alter table public.release_note_reads
  add column if not exists read_at           timestamptz not null default now(),
  add column if not exists read_published_at timestamptz;

-- Backfill read_published_at from the parent note's current published_at for
-- rows written before this column existed. Never update a non-null value here:
-- an older value is a legitimate unread receipt after a later re-publication.
update public.release_note_reads rnr
set read_published_at = rn.published_at
from public.release_notes rn
where rn.id              = rnr.release_note_id
  and rn.published_at   is not null
  and rnr.read_published_at is null;

alter table public.release_note_reads
  alter column read_published_at set not null;

-- Useful when querying "which notes has this user read?" — the primary key
-- covers the reverse (release_note_id leading), so add a user-leading index.
create index if not exists idx_release_note_reads_user
  on public.release_note_reads (user_id, release_note_id);

alter table public.release_note_reads enable row level security;

-- Drop any previously installed managed policies so this migration is
-- idempotent regardless of how many times it is applied.
drop policy if exists "Users can read their own release note reads"      on public.release_note_reads;
drop policy if exists "Users can mark a published release note as read"  on public.release_note_reads;
drop policy if exists "Users can update their own release note reads"    on public.release_note_reads;

-- SELECT: a user may only see their own read rows.
create policy "Users can read their own release note reads"
on public.release_note_reads
for select
to authenticated
using (user_id = auth.uid());

-- INSERT: a user may only insert a row for themselves, and only for a
-- published release note whose current published_at matches the supplied
-- read_published_at, preventing stale-version receipts.
create policy "Users can mark a published release note as read"
on public.release_note_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.release_notes rn
    where rn.id           = release_note_reads.release_note_id
      and rn.status       = 'published'
      and rn.published_at = release_note_reads.read_published_at
  )
);

-- UPDATE: a user may refresh read_at on their own rows (e.g. re-read).
-- read_published_at must still match the note's current published_at.
create policy "Users can update their own release note reads"
on public.release_note_reads
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.release_notes rn
    where rn.id           = release_note_reads.release_note_id
      and rn.status       = 'published'
      and rn.published_at = release_note_reads.read_published_at
  )
);

-- No general DELETE policy: once a read receipt is recorded it is permanent.

-- ---------------------------------------------------------------------------
-- RPC: get_unread_release_note_count()
--
-- Returns the number of published release notes for which the calling user
-- either has no read receipt at all or whose read_published_at no longer
-- matches the note's current published_at (i.e. the note was re-published
-- since they last read it).
--
-- SECURITY INVOKER so RLS on release_note_reads applies; the function itself
-- reads release_notes with no restriction (the authenticated role has SELECT
-- on that table, which is governed by its own published-only RLS policy).
-- ---------------------------------------------------------------------------
create or replace function public.get_unread_release_note_count()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)
  from public.release_notes rn
  where rn.status = 'published'
    and not exists (
      select 1
      from public.release_note_reads rnr
      where rnr.release_note_id  = rn.id
        and rnr.user_id          = auth.uid()
        and rnr.read_published_at = rn.published_at
    );
$$;

-- ---------------------------------------------------------------------------
-- RPC: mark_release_notes_read(expected_releases jsonb)
--
-- Atomically upserts read receipts for the calling user. Only notes whose
-- supplied published_at still matches the database's current published_at are
-- accepted; stale or fabricated entries are silently skipped.
--
-- expected_releases must be a JSON array of objects:
--   [{"id": "<uuid>", "published_at": "<iso8601>"}]
--
-- Returns the number of receipts actually upserted.
--
-- SECURITY INVOKER so the upsert is evaluated under the caller's RLS context,
-- meaning the INSERT policy ("published + published_at matches") is enforced
-- automatically even without the explicit WHERE clause.  The WHERE clause is
-- kept for defence-in-depth and to return an accurate count.
-- ---------------------------------------------------------------------------
create or replace function public.mark_release_notes_read(expected_releases jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with input as (
    select
      (elem->>'id')::uuid           as release_note_id,
      (elem->>'published_at')::timestamptz as expected_published_at
    from jsonb_array_elements(expected_releases) as elem
  ),
  matched as (
    select rn.id as release_note_id, rn.published_at
    from input i
    join public.release_notes rn
      on rn.id           = i.release_note_id
     and rn.status       = 'published'
     and rn.published_at = i.expected_published_at
  ),
  upserted as (
    insert into public.release_note_reads (release_note_id, user_id, read_at, read_published_at)
    select
      m.release_note_id,
      auth.uid(),
      now(),
      m.published_at
    from matched m
    on conflict (release_note_id, user_id)
    do update
      set read_at           = excluded.read_at,
          read_published_at = excluded.read_published_at
    returning 1
  )
  select count(*)::integer from upserted;
$$;

-- ---------------------------------------------------------------------------
-- RPC: get_published_release_notes_snapshot()
--
-- Returns a single jsonb value: an array of every currently published release
-- note in UI display order (release_date desc, published_at desc, created_at
-- desc, id desc), where each element carries:
--   id, title, release_date, published_at, created_at
--   items: array ordered by (order_index, created_at, id) with
--          id, order_index, title, location, details, created_at, updated_at
--
-- Because the entire result is assembled inside one SQL statement and returned
-- as a single jsonb scalar, PostgREST row-count pagination caps never apply
-- and the caller always receives the complete, consistent dataset in one
-- round-trip.
--
-- SECURITY INVOKER — the function executes under the caller's role so the
-- release_notes RLS policy (published-only for non-admins) applies
-- automatically.  No direct access to release_note_reads is needed here.
-- ---------------------------------------------------------------------------
create or replace function public.get_published_release_notes_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',           rn.id,
        'title',        rn.title,
        'release_date', rn.release_date,
        'published_at', rn.published_at,
        'created_at',   rn.created_at,
        'items', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id',          i.id,
                'order_index', i.order_index,
                'title',       i.title,
                'location',    i.location,
                'details',     i.details,
                'created_at',  i.created_at,
                'updated_at',  i.updated_at
              )
              order by i.order_index, i.created_at, i.id
            ),
            '[]'::jsonb
          )
          from public.release_note_items i
          where i.release_note_id = rn.id
        )
      )
      order by rn.release_date desc, rn.published_at desc, rn.created_at desc, rn.id desc
    ),
    '[]'::jsonb
  )
  from public.release_notes rn
  where rn.status = 'published';
$$;

-- Revoke broad execution rights; only authenticated callers may invoke these.
-- Revoke from the public pseudo-role unconditionally; revoke from anon only if
-- that role exists (it is present in Supabase but not in vanilla PostgreSQL).
revoke execute on function public.get_unread_release_note_count()           from public;
revoke execute on function public.mark_release_notes_read(jsonb)            from public;
revoke execute on function public.get_published_release_notes_snapshot()    from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.get_unread_release_note_count()        from anon;
    revoke execute on function public.mark_release_notes_read(jsonb)         from anon;
    revoke execute on function public.get_published_release_notes_snapshot() from anon;
  end if;
end;
$$;

grant execute on function public.get_unread_release_note_count()         to authenticated;
grant execute on function public.mark_release_notes_read(jsonb)          to authenticated;
grant execute on function public.get_published_release_notes_snapshot()  to authenticated;

notify pgrst, 'reload schema';
