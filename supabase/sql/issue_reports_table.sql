
-- Create table to track issue reports (optional logging)
create table if not exists public.issue_reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  message text not null,
  context jsonb,
  attachments_count integer default 0,
  sent_to_teams boolean default false,
  created_at timestamptz default now()
);

-- Create index for user lookup
create index if not exists issue_reports_user_id_idx on issue_reports(user_id);
create index if not exists issue_reports_created_at_idx on issue_reports(created_at);

-- RLS policies
alter table issue_reports enable row level security;

-- Only admins can view all reports, users can see their own
create policy "Admins can view all issue reports" on issue_reports
  for select using (
    exists (
      select 1 from user_roles ur
      join roles r on ur.role_id = r.id
      where ur.user_id = auth.uid()
      and r.name = 'Admin'
    )
  );

create policy "Users can view own issue reports" on issue_reports
  for select using (user_id = auth.uid());

-- Users can insert their own reports
create policy "Users can create issue reports" on issue_reports
  for insert with check (user_id = auth.uid());

-- Comment for documentation
comment on table issue_reports is 'Tracks user-submitted issue reports sent via Teams integration';
