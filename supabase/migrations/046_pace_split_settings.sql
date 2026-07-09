-- Per-user pace split preference + trigger to allocate buffer difference into
-- pace margin by moving target_deadline when task progress changes.

create table if not exists public.pace_split_settings (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  pace_split_percentage   numeric not null default 0
    check (pace_split_percentage >= 0 and pace_split_percentage <= 100),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.pace_split_settings enable row level security;

drop policy if exists "pace_split_settings_select_own" on public.pace_split_settings;
create policy "pace_split_settings_select_own"
  on public.pace_split_settings for select using (auth.uid() = user_id);

drop policy if exists "pace_split_settings_insert_own" on public.pace_split_settings;
create policy "pace_split_settings_insert_own"
  on public.pace_split_settings for insert with check (auth.uid() = user_id);

drop policy if exists "pace_split_settings_update_own" on public.pace_split_settings;
create policy "pace_split_settings_update_own"
  on public.pace_split_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "pace_split_settings_delete_own" on public.pace_split_settings;
create policy "pace_split_settings_delete_own"
  on public.pace_split_settings for delete using (auth.uid() = user_id);

-- Allocate a share of (bufferEst - trueEst) into pace margin by pulling
-- target_deadline earlier (or later on progress decreases).
-- Skips when: percentage is 0, no pace_settings, progress delta 0, or
-- realtime_progress_rate is 0 (expanded parents / compressed subtasks).
create or replace function public.apply_pace_split_on_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_split_pct numeric;
  v_progress_delta integer;
  v_rate numeric;
  v_true_est numeric;
  v_buffer_est numeric;
  v_diff numeric;
  v_alloc_minutes integer;
begin
  if tg_op = 'INSERT' then
    v_progress_delta := coalesce(new.current_progress, 0);
  elsif tg_op = 'UPDATE' then
    if old.current_progress is not distinct from new.current_progress then
      return new;
    end if;
    v_progress_delta := new.current_progress - old.current_progress;
  else
    return coalesce(new, old);
  end if;

  if v_progress_delta = 0 then
    return new;
  end if;

  select * into v_project
  from public.projects
  where id = new.project_id;

  if not found then
    return new;
  end if;

  -- No pace_settings row → nothing to adjust.
  if not exists (
    select 1 from public.pace_settings where project_id = new.project_id
  ) then
    return new;
  end if;

  select pace_split_percentage into v_split_pct
  from public.pace_split_settings
  where user_id = v_project.user_id;

  v_split_pct := coalesce(v_split_pct, 0);
  if v_split_pct = 0 then
    return new;
  end if;

  -- realtime_progress_rate already returns 0 for expanded parents and
  -- compressed subtasks (parent is counted instead — avoids double-apply).
  v_rate := public.realtime_progress_rate(new);
  if v_rate = 0 then
    return new;
  end if;

  -- 1. True estimated time (no buffer)
  v_true_est := v_progress_delta * v_rate;
  -- 2. Buffer estimated time
  v_buffer_est := v_true_est * coalesce(v_project.buffer_modifier, 1);
  -- 3. Estimated time difference (buffer-only portion)
  v_diff := v_buffer_est - v_true_est;
  -- 4. Allocate by PaceSplitPercentage; round to nearest minute
  v_alloc_minutes := round((v_diff * v_split_pct / 100.0) / 60.0)::integer;

  if v_alloc_minutes = 0 then
    return new;
  end if;

  update public.pace_settings
  set target_deadline = target_deadline - make_interval(mins => v_alloc_minutes)
  where project_id = new.project_id;

  return new;
end;
$$;

drop trigger if exists tasks_pace_split_trg on public.tasks;
create trigger tasks_pace_split_trg
  after insert or update of current_progress on public.tasks
  for each row
  execute function public.apply_pace_split_on_progress();
