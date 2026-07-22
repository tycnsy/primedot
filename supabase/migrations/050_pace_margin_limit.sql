-- Pace margin limit: app-wide cap on pace margin grown via pace split.
-- When a progress-driven split would push margin past the limit, keep margin
-- at the limit, preserve the intended post-split pace, and absorb leftover
-- into buffer_modifier (margin-preserving rebalance). Never writes true_deadline.

alter table public.pace_split_settings
  add column if not exists pace_margin_limit_seconds bigint;

comment on column public.pace_split_settings.pace_margin_limit_seconds is
  'Max pace margin in seconds. NULL = unlimited (current behavior).';

-- Unbuffered remaining work for a project (buffer_modifier treated as 1).
-- Mirrors src/lib/calc.ts remainingProgress / task_length / calculated_progress
-- aggregation rules, including complex-mode counting.
create or replace function public.project_remaining_unbuffered_seconds(p_project_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_task public.tasks;
  v_parent public.tasks;
  v_total_length numeric := 0;
  v_total_progress numeric := 0;
  v_length numeric;
  v_progress numeric;
  v_modifier numeric;
  v_current numeric;
  v_target numeric;
  v_sub_first integer;
  v_sub_mismatch boolean;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then
    return 0;
  end if;

  for v_task in
    select * from public.tasks where project_id = p_project_id
  loop
    -- Skip expanded parents (counted via subtasks).
    if v_task.complex_mode = 'expanded' then
      continue;
    end if;

    -- Skip subtasks under compressed parents (counted via parent rollup).
    if v_task.parent_id is not null then
      select * into v_parent from public.tasks where id = v_task.parent_id;
      if found and v_parent.complex_mode = 'compressed' then
        continue;
      end if;
    end if;

    -- Effective unbuffered length + progress for this counted task.
    if v_task.complex_mode = 'compressed' then
      select coalesce(sum(coalesce(scaling_modifier, 0)), 0)
      into v_modifier
      from public.tasks
      where parent_id = v_task.id;

      if v_modifier <= 0 then
        v_modifier := coalesce(v_task.scaling_modifier, 0);
      end if;

      v_length := coalesce(v_project.video_length, 0) * v_modifier;

      -- Effective progress: common subtask value when synced, else parent stored.
      select current_progress into v_sub_first
      from public.tasks
      where parent_id = v_task.id
      order by sort_order
      limit 1;

      if v_sub_first is null then
        v_current := coalesce(v_task.current_progress, 0);
      else
        select exists (
          select 1 from public.tasks
          where parent_id = v_task.id
            and current_progress is distinct from v_sub_first
        ) into v_sub_mismatch;

        if v_sub_mismatch then
          v_current := coalesce(v_task.current_progress, 0);
        else
          v_current := v_sub_first;
        end if;
      end if;

      v_target := coalesce(v_project.video_length, 0);
      if v_target > 0 and v_current::numeric / v_target >= 1 then
        v_progress := v_length;
      else
        v_progress := v_current * v_modifier;
      end if;
    else
      case v_task.type
        when 'scaling' then
          v_modifier := coalesce(v_task.scaling_modifier, 0);
          v_length := coalesce(v_project.video_length, 0) * v_modifier;
          v_target := coalesce(v_project.video_length, 0);
          v_current := coalesce(v_task.current_progress, 0);
          if v_target > 0 and v_current::numeric / v_target >= 1 then
            v_progress := v_length;
          else
            v_progress := v_current * v_modifier;
          end if;
        when 'scripting' then
          v_modifier := coalesce(v_task.scripting_modifier, 0);
          v_length := coalesce(v_task.script_length, 0) * v_modifier;
          v_target := coalesce(v_task.script_length, 0);
          v_current := coalesce(v_task.current_progress, 0);
          if v_target > 0 and v_current::numeric / v_target >= 1 then
            v_progress := v_length;
          else
            v_progress := v_current * v_modifier;
          end if;
        when 'custom' then
          v_length := coalesce(v_task.unit_count, 0) * coalesce(v_task.unit_length, 0);
          v_target := coalesce(v_task.unit_count, 0);
          v_current := coalesce(v_task.current_progress, 0);
          if v_target > 0 and v_current::numeric / v_target >= 1 then
            v_progress := v_length;
          else
            v_progress := v_current * coalesce(v_task.unit_length, 0);
          end if;
        when 'manual' then
          v_length := coalesce(v_task.manual_length, 0);
          v_target := coalesce(v_task.manual_length, 0);
          v_current := coalesce(v_task.current_progress, 0);
          if v_target > 0 and v_current::numeric / v_target >= 1 then
            v_progress := v_length;
          else
            v_progress := v_current;
          end if;
        else
          v_length := 0;
          v_progress := 0;
      end case;
    end if;

    v_total_length := v_total_length + coalesce(v_length, 0);
    v_total_progress := v_total_progress + coalesce(v_progress, 0);
  end loop;

  return greatest(0, v_total_length - v_total_progress);
end;
$$;

-- Extended pace-split trigger: optional margin limit via margin-preserving rebalance.
create or replace function public.apply_pace_split_on_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_pace public.pace_settings;
  v_split_pct numeric;
  v_margin_limit bigint;
  v_progress_delta integer;
  v_rate numeric;
  v_true_est numeric;
  v_buffer_est numeric;
  v_diff numeric;
  v_alloc_minutes integer;
  v_alloc_seconds numeric;
  v_margin_before numeric;
  v_prospective_margin numeric;
  v_desired_pace_seconds numeric;
  v_offset_seconds numeric;
  v_remaining_unbuffered numeric;
  v_hour_diff numeric;
  v_buffer_raw numeric;
  v_buffer_new numeric;
  v_now timestamptz := now();
  v_split_target timestamptz;
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
  select * into v_pace
  from public.pace_settings
  where project_id = new.project_id;

  if not found then
    return new;
  end if;

  select pace_split_percentage, pace_margin_limit_seconds
  into v_split_pct, v_margin_limit
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

  v_alloc_seconds := v_alloc_minutes * 60;
  v_split_target := v_pace.target_deadline - make_interval(secs => v_alloc_seconds);

  -- Progress decreases: never force margin up to the limit — plain split only.
  if v_alloc_minutes <= 0 then
    update public.pace_settings
    set target_deadline = v_split_target
    where project_id = new.project_id;
    return new;
  end if;

  -- Limit off → plain split (today's behavior).
  if v_margin_limit is null then
    update public.pace_settings
    set target_deadline = v_split_target
    where project_id = new.project_id;
    return new;
  end if;

  v_margin_before := extract(epoch from (v_pace.true_deadline - v_pace.target_deadline));
  v_prospective_margin := v_margin_before + v_alloc_seconds;

  -- Below / at limit after full alloc → plain split.
  if v_prospective_margin <= v_margin_limit then
    update public.pace_settings
    set target_deadline = v_split_target
    where project_id = new.project_id;
    return new;
  end if;

  -- Would exceed limit → margin-preserving rebalance.
  -- desired_pace = pace after full normal split with current buffer
  --   = (target - alloc) - estimated_completion = (split_target - now) - remaining_buffered
  -- remaining_buffered = remaining_unbuffered * buffer_modifier
  v_remaining_unbuffered := public.project_remaining_unbuffered_seconds(new.project_id);
  if v_remaining_unbuffered is null
     or not (v_remaining_unbuffered > 0)
     or not (v_remaining_unbuffered = v_remaining_unbuffered) then
    -- Fail soft: plain split.
    update public.pace_settings
    set target_deadline = v_split_target
    where project_id = new.project_id;
    return new;
  end if;

  v_desired_pace_seconds :=
    extract(epoch from (v_split_target - v_now))
    - (v_remaining_unbuffered * coalesce(v_project.buffer_modifier, 1));

  v_offset_seconds := v_margin_limit + v_desired_pace_seconds;
  v_hour_diff :=
    (extract(epoch from (v_pace.true_deadline - v_now)) - v_offset_seconds) / 3600.0;

  -- Cast through numeric so round() matches client Math.round(x*100)/100
  -- (Postgres round(numeric) is half away from zero).
  v_buffer_raw := v_hour_diff / (v_remaining_unbuffered / 3600.0);
  v_buffer_new := round((v_buffer_raw * 100)::numeric) / 100.0;

  if v_buffer_new is null
     or not (v_buffer_new > 0)
     or not (v_buffer_new = v_buffer_new) then
    -- Fail soft: plain split (never corrupt deadlines with invalid buffer).
    update public.pace_settings
    set target_deadline = v_split_target
    where project_id = new.project_id;
    return new;
  end if;

  -- target = true − limit; true_deadline unchanged.
  update public.pace_settings
  set target_deadline = v_pace.true_deadline - make_interval(secs => v_margin_limit)
  where project_id = new.project_id;

  update public.projects
  set buffer_modifier = v_buffer_new
  where id = new.project_id;

  return new;
end;
$$;
