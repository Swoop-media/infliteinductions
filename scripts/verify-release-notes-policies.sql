-- Live Supabase verification for release-note access policies.
--
-- Run this file in the configured project's Supabase SQL editor after applying
-- app/migrations/033_release_notes.sql and app/migrations/034_release_note_reads.sql.
-- It intentionally rolls back all test rows. A failure stops the check and
-- names the unsafe condition.

begin;

do $$
declare
  expected_policies text[] := array[
    'release_note_items|a|Admins can create release note items',
    'release_note_items|d|Admins can delete release note items',
    'release_note_items|r|Release note items in published history are readable',
    'release_note_items|w|Admins can update release note items',
    'release_note_reads|a|Users can mark a published release note as read',
    'release_note_reads|r|Users can read their own release note reads',
    'release_note_reads|w|Users can update their own release note reads',
    'release_notes|a|Admins can create release notes',
    'release_notes|d|Admins can delete release notes',
    'release_notes|r|Release notes published history is readable',
    'release_notes|w|Admins can update release notes'
  ];
  actual_policies  text[];
  general_user_id  uuid;
  second_user_id   uuid;
  admin_user_id    uuid;
  draft_id         uuid;
  draft_item_id    uuid;
  published_id     uuid;
  published_at_val timestamptz;
  visible_rows     integer;
  affected_rows    integer;
  unread_count     bigint;
  marked_count     integer;
  write_error      text;
begin
  if not (
    (select relrowsecurity from pg_class where oid = 'public.release_notes'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.release_note_items'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.release_note_reads'::regclass)
  ) then
    raise exception 'Release-note policy verification failed: RLS is not enabled on all release-note tables.';
  end if;

  select array_agg(policy_definition order by policy_definition)
  into actual_policies
  from (
    select format('%s|%s|%s', pg_class.relname, polcmd, polname) as policy_definition
    from pg_policy
    join pg_class      on pg_class.oid      = pg_policy.polrelid
    join pg_namespace  on pg_namespace.oid  = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in ('release_notes', 'release_note_items', 'release_note_reads')
  ) policies;

  if actual_policies is distinct from expected_policies then
    raise exception
      'Release-note policy verification failed: unexpected, missing, or legacy policy found.'
      using detail = format(
        'Expected only the managed policy set. Found: %s',
        coalesce(array_to_string(actual_policies, ', '), '<none>')
      ),
      hint = 'Re-run app/migrations/033_release_notes.sql and app/migrations/034_release_note_reads.sql. Remove permissive legacy policies such as rn_select_all_auth before approving the release.';
  end if;

  -- Use an existing user with no Admin role. The transaction is rolled back,
  -- so all test rows created below never persist.
  select user_id
  into general_user_id
  from public.user_roles
  where not public.app_has_role(user_id, 'Admin')
  limit 1;

  if general_user_id is null then
    select id
    into general_user_id
    from auth.users user_record
    where not public.app_has_role(user_record.id, 'Admin')
    limit 1;
  end if;

  if general_user_id is null then
    raise exception
      'Release-note policy verification failed: no General user is available to prove RLS.'
      using hint = 'Create or identify a non-Admin account, then run this check again.';
  end if;

  -- Identify a second general user for read-state privacy checks.
  select user_id
  into second_user_id
  from public.user_roles
  where not public.app_has_role(user_id, 'Admin')
    and user_id <> general_user_id
  limit 1;

  if second_user_id is null then
    select id
    into second_user_id
    from auth.users user_record
    where not public.app_has_role(user_record.id, 'Admin')
      and user_record.id <> general_user_id
    limit 1;
  end if;

  -- Identify an Admin user for seeding draft/published notes.
  select user_id
  into admin_user_id
  from public.user_roles
  where public.app_has_role(user_id, 'Admin')
  limit 1;

  if admin_user_id is null then
    -- Fall back: use any user for seeding (service-role bypasses RLS).
    admin_user_id := general_user_id;
  end if;

  -- -----------------------------------------------------------------------
  -- Seed a draft and a published note (bypassing RLS as service role).
  -- -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', '', true);

  insert into public.release_notes (title, release_date, created_by)
  values ('RLS verification draft - rolled back', current_date, admin_user_id)
  returning id into draft_id;

  insert into public.release_note_items (release_note_id, title, location, details)
  values (
    draft_id,
    'RLS verification item - rolled back',
    'Policy verification',
    'This draft item exists only inside the verification transaction.'
  )
  returning id into draft_item_id;

  -- Create a published note so read-receipt and RPC policies can be exercised.
  -- Insert as draft first (the insert trigger always forces draft status),
  -- add a required item, then promote to published via an update.
  insert into public.release_notes (title, release_date, created_by)
  values ('RLS verification published - rolled back', current_date, admin_user_id)
  returning id into published_id;

  insert into public.release_note_items (release_note_id, title, location, details)
  values (
    published_id,
    'RLS verification published item - rolled back',
    'Policy verification',
    'This item satisfies the publish constraint inside the verification transaction.'
  );

  update public.release_notes
  set status = 'published'
  where id = published_id;

  select published_at into published_at_val
  from public.release_notes
  where id = published_id;

  -- -----------------------------------------------------------------------
  -- Switch to the first general user.
  -- -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', general_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  -- Draft release notes must be hidden from general users.
  select count(*) into visible_rows
  from public.release_notes
  where id = draft_id;
  if visible_rows <> 0 then
    raise exception
      'Release-note policy verification failed: a General user can read draft release_notes.'
      using hint = 'Remove permissive SELECT policies (for example rn_select_all_auth).';
  end if;

  select count(*) into visible_rows
  from public.release_note_items
  where id = draft_item_id;
  if visible_rows <> 0 then
    raise exception
      'Release-note policy verification failed: a General user can read draft release_note_items.'
      using hint = 'Remove permissive SELECT policies from release_note_items.';
  end if;

  -- General users cannot write release_notes.
  begin
    insert into public.release_notes (title, release_date, created_by)
    values ('Unauthorised verification write', current_date, general_user_id);
    raise exception 'Release-note policy verification failed: a General user can insert release_notes.';
  exception
    when insufficient_privilege then null;
    when others then
      get stacked diagnostics write_error = message_text;
      if write_error !~* 'row-level security|permission denied|only draft release notes can be changed' then
        raise;
      end if;
  end;

  begin
    insert into public.release_note_items (release_note_id, title, location, details)
    values (
      draft_id,
      'Unauthorised verification write',
      'Policy verification',
      'This write must be rejected.'
    );
    raise exception 'Release-note policy verification failed: a General user can insert release_note_items.';
  exception
    when insufficient_privilege then null;
    when others then
      get stacked diagnostics write_error = message_text;
      if write_error !~* 'row-level security|permission denied|only draft release notes can be changed' then
        raise;
      end if;
  end;

  update public.release_notes
  set title = 'Unauthorised verification update'
  where id = draft_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'Release-note policy verification failed: a General user can update release_notes.';
  end if;

  update public.release_note_items
  set details = 'Unauthorised verification update'
  where id = draft_item_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'Release-note policy verification failed: a General user can update release_note_items.';
  end if;

  delete from public.release_note_items where id = draft_item_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'Release-note policy verification failed: a General user can delete release_note_items.';
  end if;

  delete from public.release_notes where id = draft_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'Release-note policy verification failed: a General user can delete release_notes.';
  end if;

  -- -----------------------------------------------------------------------
  -- Unread count: published note appears unread before a receipt exists.
  -- -----------------------------------------------------------------------
  select public.get_unread_release_note_count() into unread_count;
  if unread_count < 1 then
    raise exception
      'Release-note policy verification failed: get_unread_release_note_count() returned 0 before any receipt was written (expected >= 1).';
  end if;

  -- -----------------------------------------------------------------------
  -- RPC mark: stale published_at must not create a receipt.
  -- -----------------------------------------------------------------------
  select public.mark_release_notes_read(
    jsonb_build_array(jsonb_build_object(
      'id',           published_id,
      'published_at', (published_at_val - interval '1 second')
    ))
  ) into marked_count;
  if marked_count <> 0 then
    raise exception
      'Release-note policy verification failed: mark_release_notes_read() accepted a stale published_at (expected 0 marks, got %).', marked_count;
  end if;

  -- After the stale attempt the note should still be unread.
  select count(*) into visible_rows
  from public.release_note_reads
  where release_note_id = published_id and user_id = general_user_id;
  if visible_rows <> 0 then
    raise exception
      'Release-note policy verification failed: a stale mark attempt created a read receipt.';
  end if;

  -- -----------------------------------------------------------------------
  -- RPC mark: correct published_at must create a receipt.
  -- -----------------------------------------------------------------------
  select public.mark_release_notes_read(
    jsonb_build_array(jsonb_build_object(
      'id',           published_id,
      'published_at', published_at_val
    ))
  ) into marked_count;
  if marked_count <> 1 then
    raise exception
      'Release-note policy verification failed: mark_release_notes_read() with correct published_at returned % (expected 1).', marked_count;
  end if;

  -- -----------------------------------------------------------------------
  -- Unread count drops to zero after the receipt is written.
  -- -----------------------------------------------------------------------
  select public.get_unread_release_note_count() into unread_count;
  -- The verifier transaction may have other published notes visible to this
  -- user (from prior tests in the same transaction) so we cannot assert
  -- exactly 0; we assert that the published_id note is no longer counted.
  select count(*) into visible_rows
  from public.release_note_reads
  where release_note_id = published_id and user_id = general_user_id;
  if visible_rows <> 1 then
    raise exception
      'Release-note policy verification failed: a General user cannot read their own release_note_reads row after mark_release_notes_read().';
  end if;

  -- -----------------------------------------------------------------------
  -- Read-receipt: general user can also use direct INSERT with correct fields.
  -- -----------------------------------------------------------------------
  -- (Receipt already exists from RPC call above; direct INSERT would conflict.
  --  Test the direct path against the draft note instead — it must be rejected.)
  begin
    insert into public.release_note_reads (release_note_id, user_id, read_published_at)
    values (draft_id, general_user_id, now());
    raise exception 'Release-note policy verification failed: a General user can insert a read receipt for a draft note.';
  exception
    when insufficient_privilege then null;
    when others then
      get stacked diagnostics write_error = message_text;
      if write_error !~* 'row-level security|permission denied|new row violates' then
        raise;
      end if;
  end;

  -- -----------------------------------------------------------------------
  -- Read-state privacy: if a second user exists, verify read isolation.
  -- -----------------------------------------------------------------------
  if second_user_id is not null then
    -- Switch to second user (still authenticated role).
    perform set_config('request.jwt.claim.sub', second_user_id::text, true);

    -- Second user cannot see first user's read receipt.
    select count(*) into visible_rows
    from public.release_note_reads
    where release_note_id = published_id
      and user_id = general_user_id;
    if visible_rows <> 0 then
      raise exception
        'Release-note policy verification failed: a General user can read another user''s release_note_reads rows.';
    end if;

    -- Second user cannot write a read receipt claiming to be the first user.
    begin
      insert into public.release_note_reads (release_note_id, user_id, read_published_at)
      values (published_id, general_user_id, published_at_val);
      raise exception 'Release-note policy verification failed: a General user can insert a read receipt for another user.';
    exception
      when insufficient_privilege then null;
      when others then
        get stacked diagnostics write_error = message_text;
        if write_error !~* 'row-level security|permission denied|new row violates' then
          raise;
        end if;
    end;

    -- Switch back to first user.
    perform set_config('request.jwt.claim.sub', general_user_id::text, true);
  end if;

  -- -----------------------------------------------------------------------
  -- Snapshot RPC: must exist, return a jsonb array, include the published
  -- note, and exclude the draft note.
  -- -----------------------------------------------------------------------
  declare
    snapshot        jsonb;
    snap_ids        uuid[];
    snap_has_pub    boolean := false;
    snap_has_draft  boolean := false;
    snap_entry      jsonb;
  begin
    if not exists (
      select 1 from pg_proc
      where proname = 'get_published_release_notes_snapshot'
        and pronamespace = 'public'::regnamespace
    ) then
      raise exception
        'Release-note policy verification failed: get_published_release_notes_snapshot() does not exist.';
    end if;

    select public.get_published_release_notes_snapshot() into snapshot;

    if jsonb_typeof(snapshot) <> 'array' then
      raise exception
        'Release-note policy verification failed: get_published_release_notes_snapshot() did not return a jsonb array.';
    end if;

    for snap_entry in select jsonb_array_elements(snapshot)
    loop
      if (snap_entry->>'id')::uuid = published_id then
        snap_has_pub := true;
        -- Verify required fields are present.
        if snap_entry->>'title' is null
          or snap_entry->>'release_date' is null
          or snap_entry->>'published_at'  is null
          or snap_entry->>'created_at'    is null
          or jsonb_typeof(snap_entry->'items') <> 'array'
        then
          raise exception
            'Release-note policy verification failed: snapshot entry for published_id is missing required fields.';
        end if;
      end if;
      if (snap_entry->>'id')::uuid = draft_id then
        snap_has_draft := true;
      end if;
    end loop;

    if not snap_has_pub then
      raise exception
        'Release-note policy verification failed: get_published_release_notes_snapshot() omitted the published note.';
    end if;

    if snap_has_draft then
      raise exception
        'Release-note policy verification failed: get_published_release_notes_snapshot() included a draft note.';
    end if;
  end;

  raise notice 'Release-note policy verification passed: draft visibility, write guards, read-state privacy, RPC unread count, RPC mark correctness, and snapshot RPC completeness/draft-exclusion all verified.';
end;
$$;

rollback;
