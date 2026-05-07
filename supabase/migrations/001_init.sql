-- prime. — Sessions v1 schema
-- Mirrors SPEC.md §"Data Model"

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------- projects ----------
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  video_length    integer not null default 0,            -- seconds
  due_date        date,
  buffer_modifier numeric not null default 1,
  tag             text,
  created_at      timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);

-- ---------- tasks ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type task_status as enum ('not_started', 'in_progress', 'complete');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_type') then
    create type task_type as enum ('scaling', 'scripting', 'custom', 'manual');
  end if;
end $$;

create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  name               text not null,
  status             task_status not null default 'not_started',
  type               task_type not null,
  current_progress   integer not null default 0,
  -- type-specific fields (nullable; a CHECK enforces presence per type)
  scaling_modifier   numeric,
  scripting_modifier numeric,
  script_length      integer,
  unit_count         integer,
  unit_length        integer,
  manual_length      integer,
  created_at         timestamptz not null default now(),

  constraint tasks_type_fields_chk check (
    case type
      when 'scaling'   then scaling_modifier is not null
      when 'scripting' then scripting_modifier is not null and script_length is not null
      when 'custom'    then unit_count is not null and unit_length is not null
      when 'manual'    then manual_length is not null
    end
  )
);

create index if not exists tasks_project_id_idx on public.tasks(project_id);

-- ---------- pace_settings ----------
create table if not exists public.pace_settings (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null unique references public.projects(id) on delete cascade,
  target_deadline timestamptz not null,
  true_deadline   timestamptz not null
);

create index if not exists pace_settings_project_id_idx on public.pace_settings(project_id);

-- ---------- Row Level Security ----------
alter table public.projects       enable row level security;
alter table public.tasks          enable row level security;
alter table public.pace_settings  enable row level security;

-- projects: a row belongs to its user_id
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
  on public.projects for select using (auth.uid() = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
  on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
  on public.projects for delete using (auth.uid() = user_id);

-- tasks: ownership is via the parent project
drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own"
  on public.tasks for select
  using (exists (select 1 from public.projects p where p.id = tasks.project_id and p.user_id = auth.uid()));

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own"
  on public.tasks for insert
  with check (exists (select 1 from public.projects p where p.id = tasks.project_id and p.user_id = auth.uid()));

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own"
  on public.tasks for update
  using (exists (select 1 from public.projects p where p.id = tasks.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = tasks.project_id and p.user_id = auth.uid()));

drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own"
  on public.tasks for delete
  using (exists (select 1 from public.projects p where p.id = tasks.project_id and p.user_id = auth.uid()));

-- pace_settings: same ownership pattern
drop policy if exists "pace_select_own" on public.pace_settings;
create policy "pace_select_own"
  on public.pace_settings for select
  using (exists (select 1 from public.projects p where p.id = pace_settings.project_id and p.user_id = auth.uid()));

drop policy if exists "pace_insert_own" on public.pace_settings;
create policy "pace_insert_own"
  on public.pace_settings for insert
  with check (exists (select 1 from public.projects p where p.id = pace_settings.project_id and p.user_id = auth.uid()));

drop policy if exists "pace_update_own" on public.pace_settings;
create policy "pace_update_own"
  on public.pace_settings for update
  using (exists (select 1 from public.projects p where p.id = pace_settings.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = pace_settings.project_id and p.user_id = auth.uid()));

drop policy if exists "pace_delete_own" on public.pace_settings;
create policy "pace_delete_own"
  on public.pace_settings for delete
  using (exists (select 1 from public.projects p where p.id = pace_settings.project_id and p.user_id = auth.uid()));
