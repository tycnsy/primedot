-- prime. — Goals schema

do $$
begin
  if not exists (select 1 from pg_type where typname = 'goal_type') then
    create type goal_type as enum ('trend', 'accumulation', 'milestone');
  end if;
end $$;

create table if not exists public.goals_tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 40),
  color       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists goals_tags_user_sort_idx on public.goals_tags(user_id, sort_order, created_at);

create table if not exists public.goals_long (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  type              goal_type not null,
  name              text not null check (char_length(trim(name)) between 1 and 120),
  description       text,
  start_date        date not null,
  target_date       date not null,
  tags              text[] not null default '{}',
  related_goal_ids  text[] not null default '{}',
  archived_at       timestamptz,
  start_value       numeric,
  target_value      numeric,
  direction         text check (direction in ('up', 'down') or direction is null),
  unit              text,
  target_total      numeric,
  created_at        timestamptz not null default now(),
  constraint goals_long_type_fields_chk check (
    (type = 'trend' and start_value is not null and target_value is not null and direction is not null and unit is not null and target_total is null)
    or
    (type = 'accumulation' and target_total is not null and unit is not null and start_value is null and target_value is null and direction is null)
    or
    (type = 'milestone' and start_value is null and target_value is null and direction is null and target_total is null)
  )
);

create index if not exists goals_long_user_created_idx on public.goals_long(user_id, created_at desc);
create index if not exists goals_long_user_archived_idx on public.goals_long(user_id, archived_at);

create table if not exists public.goals_long_logs (
  id          uuid primary key default gen_random_uuid(),
  long_goal_id uuid not null references public.goals_long(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  at          timestamptz not null default now(),
  value       numeric,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists goals_long_logs_goal_at_idx on public.goals_long_logs(long_goal_id, at);
create index if not exists goals_long_logs_user_at_idx on public.goals_long_logs(user_id, at);

create table if not exists public.goals_long_milestones (
  id          uuid primary key default gen_random_uuid(),
  long_goal_id uuid not null references public.goals_long(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 160),
  due_date    date,
  done        boolean not null default false,
  done_at     timestamptz,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists goals_long_milestones_goal_sort_idx on public.goals_long_milestones(long_goal_id, sort_order, created_at);

create table if not exists public.goals_daily (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 120),
  notes       text,
  schedule    text not null check (schedule in ('daily', 'weekly')),
  kind        text not null check (kind in ('check', 'count')),
  target      integer check (target is null or target >= 1),
  unit        text,
  time_of_day text check (time_of_day in ('morning', 'anytime', 'evening') or time_of_day is null),
  tags        text[] not null default '{}',
  linked_to   uuid references public.goals_long(id) on delete set null,
  archived_at timestamptz,
  streak      integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint goals_daily_kind_fields_chk check (
    (kind = 'check')
    or
    (kind = 'count' and target is not null)
  )
);

create index if not exists goals_daily_user_created_idx on public.goals_daily(user_id, created_at);
create index if not exists goals_daily_user_archived_idx on public.goals_daily(user_id, archived_at);

create table if not exists public.goals_daily_entries (
  id            uuid primary key default gen_random_uuid(),
  daily_goal_id uuid not null references public.goals_daily(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  done          boolean,
  count         integer check (count is null or count >= 0),
  logged_at     timestamptz not null default now(),
  constraint goals_daily_entries_goal_date_unique unique (daily_goal_id, date),
  constraint goals_daily_entries_single_value_chk check (
    (case when done is not null then 1 else 0 end) +
    (case when count is not null then 1 else 0 end) <= 1
  )
);

create index if not exists goals_daily_entries_goal_date_idx on public.goals_daily_entries(daily_goal_id, date);
create index if not exists goals_daily_entries_user_date_idx on public.goals_daily_entries(user_id, date);

alter table public.goals_tags enable row level security;
alter table public.goals_long enable row level security;
alter table public.goals_long_logs enable row level security;
alter table public.goals_long_milestones enable row level security;
alter table public.goals_daily enable row level security;
alter table public.goals_daily_entries enable row level security;

drop policy if exists "goals_tags_select_own" on public.goals_tags;
create policy "goals_tags_select_own"
  on public.goals_tags for select using (auth.uid() = user_id);
drop policy if exists "goals_tags_insert_own" on public.goals_tags;
create policy "goals_tags_insert_own"
  on public.goals_tags for insert with check (auth.uid() = user_id);
drop policy if exists "goals_tags_update_own" on public.goals_tags;
create policy "goals_tags_update_own"
  on public.goals_tags for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "goals_tags_delete_own" on public.goals_tags;
create policy "goals_tags_delete_own"
  on public.goals_tags for delete using (auth.uid() = user_id);

drop policy if exists "goals_long_select_own" on public.goals_long;
create policy "goals_long_select_own"
  on public.goals_long for select using (auth.uid() = user_id);
drop policy if exists "goals_long_insert_own" on public.goals_long;
create policy "goals_long_insert_own"
  on public.goals_long for insert with check (auth.uid() = user_id);
drop policy if exists "goals_long_update_own" on public.goals_long;
create policy "goals_long_update_own"
  on public.goals_long for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "goals_long_delete_own" on public.goals_long;
create policy "goals_long_delete_own"
  on public.goals_long for delete using (auth.uid() = user_id);

drop policy if exists "goals_long_logs_select_own" on public.goals_long_logs;
create policy "goals_long_logs_select_own"
  on public.goals_long_logs for select using (auth.uid() = user_id);
drop policy if exists "goals_long_logs_insert_own" on public.goals_long_logs;
create policy "goals_long_logs_insert_own"
  on public.goals_long_logs for insert with check (auth.uid() = user_id);
drop policy if exists "goals_long_logs_update_own" on public.goals_long_logs;
create policy "goals_long_logs_update_own"
  on public.goals_long_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "goals_long_logs_delete_own" on public.goals_long_logs;
create policy "goals_long_logs_delete_own"
  on public.goals_long_logs for delete using (auth.uid() = user_id);

drop policy if exists "goals_long_milestones_select_own" on public.goals_long_milestones;
create policy "goals_long_milestones_select_own"
  on public.goals_long_milestones for select using (auth.uid() = user_id);
drop policy if exists "goals_long_milestones_insert_own" on public.goals_long_milestones;
create policy "goals_long_milestones_insert_own"
  on public.goals_long_milestones for insert with check (auth.uid() = user_id);
drop policy if exists "goals_long_milestones_update_own" on public.goals_long_milestones;
create policy "goals_long_milestones_update_own"
  on public.goals_long_milestones for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "goals_long_milestones_delete_own" on public.goals_long_milestones;
create policy "goals_long_milestones_delete_own"
  on public.goals_long_milestones for delete using (auth.uid() = user_id);

drop policy if exists "goals_daily_select_own" on public.goals_daily;
create policy "goals_daily_select_own"
  on public.goals_daily for select using (auth.uid() = user_id);
drop policy if exists "goals_daily_insert_own" on public.goals_daily;
create policy "goals_daily_insert_own"
  on public.goals_daily for insert with check (auth.uid() = user_id);
drop policy if exists "goals_daily_update_own" on public.goals_daily;
create policy "goals_daily_update_own"
  on public.goals_daily for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "goals_daily_delete_own" on public.goals_daily;
create policy "goals_daily_delete_own"
  on public.goals_daily for delete using (auth.uid() = user_id);

drop policy if exists "goals_daily_entries_select_own" on public.goals_daily_entries;
create policy "goals_daily_entries_select_own"
  on public.goals_daily_entries for select using (auth.uid() = user_id);
drop policy if exists "goals_daily_entries_insert_own" on public.goals_daily_entries;
create policy "goals_daily_entries_insert_own"
  on public.goals_daily_entries for insert with check (auth.uid() = user_id);
drop policy if exists "goals_daily_entries_update_own" on public.goals_daily_entries;
create policy "goals_daily_entries_update_own"
  on public.goals_daily_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "goals_daily_entries_delete_own" on public.goals_daily_entries;
create policy "goals_daily_entries_delete_own"
  on public.goals_daily_entries for delete using (auth.uid() = user_id);
