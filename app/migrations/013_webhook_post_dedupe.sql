-- 013: Deduplicate Teams notifications and channel webhook posts.
-- Run this in the Supabase SQL editor.
--
-- Part 1: dedupe table for outbound Teams channel webhook posts.
-- The approval/rejection flows can be invoked more than once for the same
-- event (retries, double submits, duplicate webhook fires), which posted the
-- same adaptive card to the Teams channel multiple times. The app now claims
-- an event key here before posting; a second claim hits the primary key and
-- the post is skipped.
-- Service-role access only (deny-all RLS, same pattern as authorisation_assignment_history).

create table if not exists public.webhook_post_dedupe (
  event_key text primary key,
  created_at timestamptz not null default now()
);

alter table public.webhook_post_dedupe enable row level security;
-- No policies: only the service role (which bypasses RLS) may read/write.

-- Part 2: drop the live-DB trigger that inserts duplicate
-- 'authorisation_pending_approval' notification rows directly (event_id built
-- from EXTRACT(epoch FROM now()), relative /app/admin/review URL). The app's
-- webhook + auto-fix sweep already create these notifications with a stable
-- per-day event_id, so the trigger only produces duplicates that bypass the
-- uq_notifications_event_per_user dedupe index.
-- The trigger exists only in the live DB (not in repo SQL), so we discover it
-- by matching the trigger function body.
do $$
declare
  r record;
  remaining int;
begin
  for r in
    select t.tgname, c.relname, p.proname, p.oid as fnoid
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace cn on cn.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    where not t.tgisinternal
      and cn.nspname = 'public'
      and pn.nspname = 'public'
      -- only tables this notification can plausibly fire from
      and c.relname in ('authorisation_assignments', 'course_assignments', 'assignment_progress')
      -- function body must both reference the notification type AND insert into notifications
      and pg_get_functiondef(p.oid) ilike '%authorisation_pending_approval%'
      and pg_get_functiondef(p.oid) ilike '%insert into%notifications%'
  loop
    raise notice 'Dropping duplicate notification trigger % on % (function %)', r.tgname, r.relname, r.proname;
    execute format('drop trigger %I on public.%I', r.tgname, r.relname);

    -- Drop the function only if no other trigger still uses it
    select count(*) into remaining from pg_trigger where tgfoid = r.fnoid and not tgisinternal;
    if remaining = 0 then
      execute format('drop function if exists public.%I()', r.proname);
    else
      raise notice 'Function % still used by % other trigger(s); not dropped', r.proname, remaining;
    end if;
  end loop;
end $$;

-- NOTE on channel-post dedupe semantics: the app claims the event key BEFORE
-- posting (at-most-once). If a Teams webhook post fails after the claim, the
-- card is not retried — preferred here over risking duplicate channel posts.
