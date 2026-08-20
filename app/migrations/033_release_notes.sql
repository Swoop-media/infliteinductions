-- 033: Managed application release notes
--
-- Releases are authored by Admins, then deliberately published for every
-- authenticated user. Item content remains structured so the public history
-- can show both where a change happened and what changed.

create table if not exists public.release_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null constraint release_notes_title_required
    check (char_length(btrim(title)) between 1 and 200),
  release_date date not null default current_date,
  status text not null default 'draft'
    constraint release_notes_valid_status check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint release_notes_published_timestamp
    check (status <> 'published' or published_at is not null)
);

create table if not exists public.release_note_items (
  id uuid primary key default gen_random_uuid(),
  release_note_id uuid not null references public.release_notes(id) on delete cascade,
  order_index integer not null default 0 check (order_index >= 0),
  title text not null constraint release_note_items_title_required
    check (char_length(btrim(title)) between 1 and 200),
  location text not null constraint release_note_items_location_required
    check (char_length(btrim(location)) between 1 and 200),
  details text not null constraint release_note_items_details_required
    check (char_length(btrim(details)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The initial release-notes prototype existed in some environments before
-- this numbered migration. Reconcile that table shape before creating
-- indexes, policies, or triggers so this migration can be re-run safely.
alter table public.release_notes
  add column if not exists title text,
  add column if not exists release_date date,
  add column if not exists status text,
  add column if not exists published_at timestamptz,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

-- If this migration is being re-run, remove its own guards while normalizing
-- old rows. The triggers are recreated below before the migration completes.
drop trigger if exists trg_release_notes_updated_at on public.release_notes;
drop trigger if exists trg_release_note_insert_as_draft on public.release_notes;
drop trigger if exists trg_release_note_lifecycle on public.release_notes;
drop trigger if exists trg_release_note_items_updated_at on public.release_note_items;
drop trigger if exists trg_release_note_items_draft_only on public.release_note_items;

update public.release_notes
set
  title = left(coalesce(nullif(btrim(title), ''), 'Untitled release'), 200),
  release_date = coalesce(release_date, current_date),
  status = case when status in ('draft', 'published', 'archived') then status else 'draft' end,
  published_at = case
    when status = 'published' then coalesce(published_at, now())
    else published_at
  end,
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  title is distinct from left(coalesce(nullif(btrim(title), ''), 'Untitled release'), 200)
  or release_date is null
  or status is distinct from case when status in ('draft', 'published', 'archived') then status else 'draft' end
  or (status = 'published' and published_at is null)
  or created_at is null
  or updated_at is null;

alter table public.release_notes
  alter column title set not null,
  alter column release_date set default current_date,
  alter column release_date set not null,
  alter column status set default 'draft',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.release_note_items
  add column if not exists release_note_id uuid,
  add column if not exists order_index integer,
  add column if not exists title text,
  add column if not exists location text,
  add column if not exists details text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.release_note_items
set
  order_index = greatest(coalesce(order_index, 0), 0),
  title = left(coalesce(nullif(btrim(title), ''), 'Untitled change'), 200),
  location = left(coalesce(nullif(btrim(location), ''), 'General'), 200),
  details = left(coalesce(nullif(btrim(details), ''), 'No details provided.'), 10000),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  order_index is null
  or order_index < 0
  or title is distinct from left(coalesce(nullif(btrim(title), ''), 'Untitled change'), 200)
  or location is distinct from left(coalesce(nullif(btrim(location), ''), 'General'), 200)
  or details is distinct from left(coalesce(nullif(btrim(details), ''), 'No details provided.'), 10000)
  or created_at is null
  or updated_at is null;

alter table public.release_note_items
  alter column order_index set default 0,
  alter column order_index set not null,
  alter column title set not null,
  alter column location set not null,
  alter column details set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from public.release_notes where created_by is null
  ) then
    alter table public.release_notes alter column created_by set not null;
  end if;

  if not exists (
    select 1 from public.release_note_items where release_note_id is null
  ) then
    alter table public.release_note_items alter column release_note_id set not null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.release_notes'::regclass
      and conname = 'release_notes_title_required'
  ) then
    alter table public.release_notes
      add constraint release_notes_title_required
      check (char_length(btrim(title)) between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.release_notes'::regclass
      and conname = 'release_notes_valid_status'
  ) then
    alter table public.release_notes
      add constraint release_notes_valid_status
      check (status in ('draft', 'published', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.release_notes'::regclass
      and conname = 'release_notes_published_timestamp'
  ) then
    alter table public.release_notes
      add constraint release_notes_published_timestamp
      check (status <> 'published' or published_at is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.release_note_items'::regclass
      and conname = 'release_note_items_release_note_id_fkey'
  ) then
    alter table public.release_note_items
      add constraint release_note_items_release_note_id_fkey
      foreign key (release_note_id) references public.release_notes(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.release_note_items'::regclass
      and conname = 'release_note_items_title_required'
  ) then
    alter table public.release_note_items
      add constraint release_note_items_title_required
      check (char_length(btrim(title)) between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.release_note_items'::regclass
      and conname = 'release_note_items_location_required'
  ) then
    alter table public.release_note_items
      add constraint release_note_items_location_required
      check (char_length(btrim(location)) between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.release_note_items'::regclass
      and conname = 'release_note_items_details_required'
  ) then
    alter table public.release_note_items
      add constraint release_note_items_details_required
      check (char_length(btrim(details)) between 1 and 10000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.release_note_items'::regclass
      and conname = 'release_note_items_nonnegative_order'
  ) then
    alter table public.release_note_items
      add constraint release_note_items_nonnegative_order
      check (order_index >= 0);
  end if;
end;
$$;

create index if not exists idx_release_notes_public_history
  on public.release_notes (release_date desc, published_at desc, created_at desc, id desc)
  where status = 'published';

create index if not exists idx_release_notes_status_updated
  on public.release_notes (status, updated_at desc);

create index if not exists idx_release_note_items_release_order
  on public.release_note_items (release_note_id, order_index, created_at, id);

create or replace function public.set_release_notes_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- A release cannot be born published because its child changes do not exist
-- yet. Force every insert through the draft -> published transition below.
create or replace function public.enforce_release_note_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status := 'draft';
  new.published_at := null;
  new.published_by := null;
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

-- Keep publication metadata trustworthy and validate publication in the same
-- transaction that changes status. Updating the parent row also establishes
-- the lock used by the item trigger below.
create or replace function public.enforce_release_note_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft'
    and (new.title, new.release_date) is distinct from (old.title, old.release_date)
  then
    raise exception 'Published and archived releases must be returned to draft before editing';
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if new.status = 'published' and old.status <> 'published' then
    if not exists (
      select 1
      from public.release_note_items item
      where item.release_note_id = old.id
        and char_length(btrim(item.title)) > 0
        and char_length(btrim(item.location)) > 0
        and char_length(btrim(item.details)) > 0
    ) then
      raise exception 'Add at least one complete change before publishing';
    end if;

    new.published_at := now();
    new.published_by := auth.uid();
  else
    new.published_at := old.published_at;
    new.published_by := old.published_by;
  end if;

  return new;
end;
$$;

-- Every item mutation locks its parent release and verifies it is still a
-- draft. This serializes item changes with publication and closes the
-- publish/edit race rather than relying on an earlier application-layer read.
create or replace function public.enforce_release_note_item_draft()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_id uuid;
  parent_status text;
begin
  if tg_op = 'UPDATE' and new.release_note_id <> old.release_note_id then
    raise exception 'Release note items cannot be moved between releases';
  end if;

  parent_id := case when tg_op = 'DELETE' then old.release_note_id else new.release_note_id end;

  select release_note.status
  into parent_status
  from public.release_notes release_note
  where release_note.id = parent_id
  for update;

  -- A cascading parent deletion can make the parent unavailable to this
  -- trigger. Direct item deletes still find the parent and require draft.
  if parent_status is null and tg_op = 'DELETE' then
    return old;
  end if;

  if parent_status is distinct from 'draft' then
    raise exception 'Only draft release notes can be changed';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_release_notes_updated_at on public.release_notes;
create trigger trg_release_notes_updated_at
before update on public.release_notes
for each row execute function public.set_release_notes_updated_at();

drop trigger if exists trg_release_note_insert_as_draft on public.release_notes;
create trigger trg_release_note_insert_as_draft
before insert on public.release_notes
for each row execute function public.enforce_release_note_insert();

drop trigger if exists trg_release_note_lifecycle on public.release_notes;
create trigger trg_release_note_lifecycle
before update on public.release_notes
for each row execute function public.enforce_release_note_lifecycle();

drop trigger if exists trg_release_note_items_updated_at on public.release_note_items;
create trigger trg_release_note_items_updated_at
before update on public.release_note_items
for each row execute function public.set_release_notes_updated_at();

drop trigger if exists trg_release_note_items_draft_only on public.release_note_items;
create trigger trg_release_note_items_draft_only
before insert or update or delete on public.release_note_items
for each row execute function public.enforce_release_note_item_draft();

alter table public.release_notes enable row level security;
alter table public.release_note_items enable row level security;

-- Earlier release-note prototypes used rn_* policy names. Remove those
-- permissive legacy policies before installing the managed policy set below;
-- otherwise rn_select_all_auth continues exposing drafts alongside this
-- migration's published-history policy.
drop policy if exists "rn_select_all_auth" on public.release_notes;
drop policy if exists "rn_admin_insert" on public.release_notes;
drop policy if exists "rn_admin_update" on public.release_notes;
drop policy if exists "rn_admin_delete" on public.release_notes;

drop policy if exists "Release notes published history is readable" on public.release_notes;
create policy "Release notes published history is readable"
on public.release_notes
for select
to authenticated
using (
  status = 'published'
  or public.app_has_role(auth.uid(), 'Admin')
);

drop policy if exists "Admins can create release notes" on public.release_notes;
create policy "Admins can create release notes"
on public.release_notes
for insert
to authenticated
with check (
  public.app_has_role(auth.uid(), 'Admin')
  and created_by = auth.uid()
);

drop policy if exists "Admins can update release notes" on public.release_notes;
create policy "Admins can update release notes"
on public.release_notes
for update
to authenticated
using (public.app_has_role(auth.uid(), 'Admin'))
with check (public.app_has_role(auth.uid(), 'Admin'));

drop policy if exists "Admins can delete release notes" on public.release_notes;
create policy "Admins can delete release notes"
on public.release_notes
for delete
to authenticated
using (
  public.app_has_role(auth.uid(), 'Admin')
  and status = 'draft'
);

drop policy if exists "Release note items in published history are readable" on public.release_note_items;
create policy "Release note items in published history are readable"
on public.release_note_items
for select
to authenticated
using (
  public.app_has_role(auth.uid(), 'Admin')
  or exists (
    select 1
    from public.release_notes release_note
    where release_note.id = release_note_items.release_note_id
      and release_note.status = 'published'
  )
);

drop policy if exists "Admins can create release note items" on public.release_note_items;
create policy "Admins can create release note items"
on public.release_note_items
for insert
to authenticated
with check (
  public.app_has_role(auth.uid(), 'Admin')
  and exists (
    select 1
    from public.release_notes release_note
    where release_note.id = release_note_items.release_note_id
      and release_note.status = 'draft'
  )
);

drop policy if exists "Admins can update release note items" on public.release_note_items;
create policy "Admins can update release note items"
on public.release_note_items
for update
to authenticated
using (
  public.app_has_role(auth.uid(), 'Admin')
  and exists (
    select 1
    from public.release_notes release_note
    where release_note.id = release_note_items.release_note_id
      and release_note.status = 'draft'
  )
)
with check (
  public.app_has_role(auth.uid(), 'Admin')
  and exists (
    select 1
    from public.release_notes release_note
    where release_note.id = release_note_items.release_note_id
      and release_note.status = 'draft'
  )
);

drop policy if exists "Admins can delete release note items" on public.release_note_items;
create policy "Admins can delete release note items"
on public.release_note_items
for delete
to authenticated
using (
  public.app_has_role(auth.uid(), 'Admin')
  and exists (
    select 1
    from public.release_notes release_note
    where release_note.id = release_note_items.release_note_id
      and release_note.status = 'draft'
  )
);

notify pgrst, 'reload schema';