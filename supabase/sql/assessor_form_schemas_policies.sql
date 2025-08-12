-- Reference copy of policies applied in Supabase
-- Helper
create or replace function public.app_has_role(u uuid, wanted text)
returns boolean
language plpgsql
stable
as $$
declare
  has_col_role boolean;
  has_col_role_name boolean;
  has_col_role_id boolean;
  has_roles_table boolean;
  ok boolean := false;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_roles' and column_name='role'
  ) into has_col_role;

  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_roles' and column_name='role_name'
  ) into has_col_role_name;

  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_roles' and column_name='role_id'
  ) into has_col_role_id;

  select exists(
    select 1 from information_schema.tables
    where table_schema='public' and table_name='roles'
  ) into has_roles_table;

  if has_col_role then
    select exists(select 1 from public.user_roles ur where ur.user_id=u and ur.role=wanted) into ok;
    return ok;
  elsif has_col_role_name then
    select exists(select 1 from public.user_roles ur where ur.user_id=u and ur.role_name=wanted) into ok;
    return ok;
  elsif has_col_role_id and has_roles_table then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='roles' and column_name='name') then
      select exists(
        select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
        where ur.user_id=u and r.name=wanted
      ) into ok;
      return ok;
    elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='roles' and column_name='role') then
      select exists(
        select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
        where ur.user_id=u and r.role=wanted
      ) into ok;
      return ok;
    else
      return false;
    end if;
  else
    return false;
  end if;
end
$$;

alter table public.assessor_form_schemas enable row level security;

drop policy if exists "assessor schemas write" on public.assessor_form_schemas;
create policy "assessor schemas write"
on public.assessor_form_schemas
for insert
to authenticated
with check (
  public.app_has_role(auth.uid(), 'Course creators')
  or public.app_has_role(auth.uid(), 'Senior management')
  or public.app_has_role(auth.uid(), 'Admin')
);

drop policy if exists "assessor schemas update" on public.assessor_form_schemas;
create policy "assessor schemas update"
on public.assessor_form_schemas
for update
to authenticated
using (
  public.app_has_role(auth.uid(), 'Course creators')
  or public.app_has_role(auth.uid(), 'Senior management')
  or public.app_has_role(auth.uid(), 'Admin')
)
with check (
  public.app_has_role(auth.uid(), 'Course creators')
  or public.app_has_role(auth.uid(), 'Senior management')
  or public.app_has_role(auth.uid(), 'Admin')
);

drop policy if exists "assessor schemas read" on public.assessor_form_schemas;
create policy "assessor schemas read"
on public.assessor_form_schemas
for select
to authenticated
using (
  public.app_has_role(auth.uid(), 'Course creators')
  or public.app_has_role(auth.uid(), 'Senior management')
  or public.app_has_role(auth.uid(), 'Admin')
  or public.app_has_role(auth.uid(), 'Trainers and assessors')
);
