-- Live Supabase verification for release-note access policies.
--
-- Run this file in the configured project's Supabase SQL editor after applying
-- app/migrations/033_release_notes.sql. It intentionally rolls back all test
-- rows. A failure stops the check and names the unsafe condition.

begin;

do $$
declare
  expected_policies text[] := array[
    'release_note_items|a|Admins can create release note items',
    'release_note_items|d|Admins can delete release note items',
    'release_note_items|r|Release note items in published history are readable',
    'release_note_items|w|Admins can update release note items',
    'release_notes|a|Admins can create release notes',
    'release_notes|d|Admins can delete release notes',
    'release_notes|r|Release notes published history is readable',
    'release_notes|w|Admins can update release notes'
  ];
  actual_policies text[];
  general_user_id uuid;
  draft_id uuid;
  draft_item_id uuid;
  visible_rows integer;
  affected_rows integer;
  write_error text;
begin
  if not (
    (select relrowsecurity from pg_class where oid = 'public.release_notes'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.release_note_items'::regclass)
  ) then
    raise exception 'Release-note policy verification failed: RLS is not enabled on both release-note tables.';
  end if;

  select array_agg(policy_definition order by policy_definition)
  into actual_policies
  from (
    select format('%s|%s|%s', pg_class.relname, polcmd, polname) as policy_definition
    from pg_policy
    join pg_class on pg_class.oid = pg_policy.polrelid
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in ('release_notes', 'release_note_items')
  ) policies;

  if actual_policies is distinct from expected_policies then
    raise exception
      'Release-note policy verification failed: unexpected, missing, or legacy policy found.'
      using detail = format(
        'Expected only the managed policy set. Found: %s',
        coalesce(array_to_string(actual_policies, ', '), '<none>')
      ),
      hint = 'Re-run app/migrations/033_release_notes.sql. Remove permissive legacy policies such as rn_select_all_auth before approving the release.';
  end if;

  -- Use an existing user with no Admin role. The transaction is rolled back,
  -- so the draft and item used to exercise RLS never persist.
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

  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.release_notes (title, release_date, created_by)
  values ('RLS verification draft - rolled back', current_date, general_user_id)
  returning id into draft_id;

  insert into public.release_note_items (release_note_id, title, location, details)
  values (
    draft_id,
    'RLS verification item - rolled back',
    'Policy verification',
    'This draft item exists only inside the verification transaction.'
  )
  returning id into draft_item_id;

  perform set_config('request.jwt.claim.sub', general_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

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

  raise notice 'Release-note policy verification passed: General users cannot read drafts or write either release-note table.';
end;
$$;

rollback;