-- Per-tag (channel) daily realtime goals used by the goal-based heatmap coloring.
-- daily_goal_seconds is the target realtime per day for projects carrying this tag.

create table if not exists public.tag_goals (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  tag_name            text not null,
  daily_goal_seconds  numeric not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint tag_goals_user_tag_unique unique (user_id, tag_name)
);

create index if not exists tag_goals_user_id_idx
  on public.tag_goals(user_id);

alter table public.tag_goals enable row level security;

drop policy if exists "tag_goals_select_own" on public.tag_goals;
create policy "tag_goals_select_own"
  on public.tag_goals for select using (auth.uid() = user_id);

drop policy if exists "tag_goals_insert_own" on public.tag_goals;
create policy "tag_goals_insert_own"
  on public.tag_goals for insert with check (auth.uid() = user_id);

drop policy if exists "tag_goals_update_own" on public.tag_goals;
create policy "tag_goals_update_own"
  on public.tag_goals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tag_goals_delete_own" on public.tag_goals;
create policy "tag_goals_delete_own"
  on public.tag_goals for delete using (auth.uid() = user_id);
