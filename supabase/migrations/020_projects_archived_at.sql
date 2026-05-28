alter table public.projects
  add column if not exists archived_at timestamptz;

create index if not exists projects_user_archived_idx
  on public.projects(user_id, archived_at);
