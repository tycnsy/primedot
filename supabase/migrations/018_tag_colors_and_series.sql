-- Add color support for project tags and introduce reusable project series.

alter table public.project_tags
add column if not exists color text not null default '#9CA3AF';

create table if not exists public.project_series (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#9CA3AF',
  created_at timestamptz not null default now(),
  constraint project_series_user_name_unique unique (user_id, name)
);

create index if not exists project_series_user_id_idx
  on public.project_series(user_id);

alter table public.project_series enable row level security;

drop policy if exists "project_series_select_own" on public.project_series;
create policy "project_series_select_own"
  on public.project_series for select using (auth.uid() = user_id);

drop policy if exists "project_series_insert_own" on public.project_series;
create policy "project_series_insert_own"
  on public.project_series for insert with check (auth.uid() = user_id);

drop policy if exists "project_series_update_own" on public.project_series;
create policy "project_series_update_own"
  on public.project_series for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "project_series_delete_own" on public.project_series;
create policy "project_series_delete_own"
  on public.project_series for delete using (auth.uid() = user_id);

alter table public.projects
add column if not exists series text;

alter table public.project_templates
add column if not exists series text;

insert into public.project_series (user_id, name)
select distinct p.user_id, trim(p.series)
from public.projects p
where p.series is not null
  and trim(p.series) <> ''
on conflict (user_id, name) do nothing;
