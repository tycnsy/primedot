-- Per-project pace split percentage and pace margin limit.
-- pace_split_settings remains user defaults for new projects.
-- Existing projects are backfilled from each user's current defaults.

alter table public.projects
  add column if not exists pace_split_percentage numeric not null default 0
    check (pace_split_percentage >= 0 and pace_split_percentage <= 100);

alter table public.projects
  add column if not exists pace_margin_limit_seconds bigint;

comment on column public.projects.pace_split_percentage is
  'Share of buffer-only estimate difference allocated into pace margin on progress (0–100).';

comment on column public.projects.pace_margin_limit_seconds is
  'Max pace margin in seconds for this project. NULL = unlimited.';

comment on table public.pace_split_settings is
  'Per-user defaults for pace_split_percentage and pace_margin_limit_seconds applied when creating new projects.';

-- Preserve current behavior: copy user-wide settings onto every project.
update public.projects p
set
  pace_split_percentage = s.pace_split_percentage,
  pace_margin_limit_seconds = s.pace_margin_limit_seconds
from public.pace_split_settings s
where s.user_id = p.user_id;

-- Trigger now reads split/limit from the project row (not user defaults).
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

  v_split_pct := coalesce(v_project.pace_split_percentage, 0);
  v_margin_limit := v_project.pace_margin_limit_seconds;

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

  -- Limit off → plain split.
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
