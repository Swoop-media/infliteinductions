
-- Teams integration tables

-- Table to store Teams conversation references and user mappings
create table if not exists public.teams_links (
  id uuid default gen_random_uuid() primary key,
  teams_user_id text unique not null, -- Teams user ID
  aad_object_id text, -- Azure AD object ID
  user_id uuid references auth.users(id) on delete cascade, -- App user ID
  conversation_ref jsonb not null, -- Store conversation reference for proactive messaging
  last_activity timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Table for temporary link codes
create table if not exists public.teams_link_codes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  code text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists teams_links_user_id_idx on teams_links(user_id);
create index if not exists teams_links_aad_object_id_idx on teams_links(aad_object_id);
create index if not exists teams_link_codes_user_id_idx on teams_link_codes(user_id);
create index if not exists teams_link_codes_expires_idx on teams_link_codes(expires_at);

-- RLS policies
alter table teams_links enable row level security;
alter table teams_link_codes enable row level security;

-- Users can only see their own links
create policy "Users can view own teams links" on teams_links
  for select using (user_id = auth.uid());

create policy "Service role can manage teams links" on teams_links
  for all using (auth.role() = 'service_role');

create policy "Users can manage own link codes" on teams_link_codes
  for all using (user_id = auth.uid());

-- Trigger to update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_teams_links_updated_at
  before update on teams_links
  for each row execute procedure update_updated_at_column();
