-- Realtime estimate audit log + heatmap source.
-- Captures tracked task/project field changes; only current_progress deltas
-- contribute realtime seconds (buffer excluded).

create table if not exists public.realtime_logs (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  project_id              uuid not null references public.projects(id) on delete cascade,
  task_id                 uuid references public.tasks(id) on delete set null,
  change_kind             text not null,
  old_value               text,
  new_value               text,
  realtime_delta_seconds  numeric not null default 0,
  -- snapshot at time of log (static even if source rows later change)
  task_name               text,
  task_type               text,
  project_name            text not null,
  project_tag             text,
  project_series          text,
  video_length            integer,
  scaling_modifier        numeric,
  scripting_modifier      numeric,
  script_length           integer,
  unit_count              integer,
  unit_length             integer,
  current_progress        integer,
  logged_at               timestamptz not null default now()
);

create index if not exists realtime_logs_user_logged_at_idx
  on public.realtime_logs(user_id, logged_at desc);

create index if not exists realtime_logs_project_logged_at_idx
  on public.realtime_logs(project_id, logged_at desc);

-- Per-unit realtime rate (no buffer), mirroring src/lib/calc.ts aggregation rules.
create or replace function public.realtime_progress_rate(p_task public.tasks)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parent_mode complex_mode;
  subtask_sum numeric;
begin
  if p_task.complex_mode = 'expanded' then
    return 0;
  end if;

  if p_task.complex_mode = 'compressed' then
    select coalesce(sum(coalesce(scaling_modifier, 0)), 0)
    into subtask_sum
    from public.tasks
    where parent_id = p_task.id;

    if subtask_sum > 0 then
      return subtask_sum;
    end if;
    return coalesce(p_task.scaling_modifier, 0);
  end if;

  if p_task.parent_id is not null then
    select complex_mode into parent_mode
    from public.tasks
    where id = p_task.parent_id;

    if parent_mode = 'compressed' then
      return 0;
    end if;
  end if;

  case p_task.type
    when 'scaling' then return coalesce(p_task.scaling_modifier, 0);
    when 'scripting' then return coalesce(p_task.scripting_modifier, 0);
    when 'custom' then return coalesce(p_task.unit_length, 0);
    when 'manual' then return 1;
    else return 0;
  end case;
end;
$$;

create or replace function public.insert_realtime_log(
  p_user_id uuid,
  p_project_id uuid,
  p_task_id uuid,
  p_change_kind text,
  p_old_value text,
  p_new_value text,
  p_realtime_delta_seconds numeric,
  p_task public.tasks,
  p_project public.projects
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.realtime_logs (
    user_id,
    project_id,
    task_id,
    change_kind,
    old_value,
    new_value,
    realtime_delta_seconds,
    task_name,
    task_type,
    project_name,
    project_tag,
    project_series,
    video_length,
    scaling_modifier,
    scripting_modifier,
    script_length,
    unit_count,
    unit_length,
    current_progress
  ) values (
    p_user_id,
    p_project_id,
    p_task_id,
    p_change_kind,
    p_old_value,
    p_new_value,
    coalesce(p_realtime_delta_seconds, 0),
    p_task.name,
    case when p_task.id is not null then p_task.type::text else null end,
    p_project.name,
    p_project.tag,
    p_project.series,
    p_project.video_length,
    p_task.scaling_modifier,
    p_task.scripting_modifier,
    p_task.script_length,
    p_task.unit_count,
    p_task.unit_length,
    p_task.current_progress
  );
end;
$$;

create or replace function public.log_task_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_user_id uuid;
  v_rate numeric;
  v_delta numeric;
  v_task public.tasks;
begin
  if tg_op = 'DELETE' then
    select * into v_project from public.projects where id = old.project_id;
    if not found then
      return old;
    end if;
    v_user_id := v_project.user_id;
    v_task := old;

    perform public.insert_realtime_log(
      v_user_id,
      old.project_id,
      old.id,
      'task_deleted',
      old.name,
      null,
      0,
      v_task,
      v_project
    );
    return old;
  end if;

  select * into v_project from public.projects where id = new.project_id;
  if not found then
    return new;
  end if;
  v_user_id := v_project.user_id;
  v_task := new;

  if tg_op = 'INSERT' then
    perform public.insert_realtime_log(
      v_user_id,
      new.project_id,
      new.id,
      'task_created',
      null,
      new.name,
      0,
      v_task,
      v_project
    );

    if new.name is not null then
      perform public.insert_realtime_log(
        v_user_id, new.project_id, new.id, 'task_name', null, new.name, 0, v_task, v_project
      );
    end if;

    perform public.insert_realtime_log(
      v_user_id, new.project_id, new.id, 'task_type', null, new.type::text, 0, v_task, v_project
    );

    if new.type = 'scaling' and new.scaling_modifier is not null then
      perform public.insert_realtime_log(
        v_user_id, new.project_id, new.id, 'scaling_modifier', null, new.scaling_modifier::text, 0, v_task, v_project
      );
    end if;

    if new.type = 'scripting' and new.scripting_modifier is not null then
      perform public.insert_realtime_log(
        v_user_id, new.project_id, new.id, 'scripting_modifier', null, new.scripting_modifier::text, 0, v_task, v_project
      );
    end if;

    if new.type = 'scripting' and new.script_length is not null then
      perform public.insert_realtime_log(
        v_user_id, new.project_id, new.id, 'script_length', null, new.script_length::text, 0, v_task, v_project
      );
    end if;

    if new.type = 'custom' and new.unit_count is not null then
      perform public.insert_realtime_log(
        v_user_id, new.project_id, new.id, 'unit_count', null, new.unit_count::text, 0, v_task, v_project
      );
    end if;

    if new.type = 'custom' and new.unit_length is not null then
      perform public.insert_realtime_log(
        v_user_id, new.project_id, new.id, 'unit_length', null, new.unit_length::text, 0, v_task, v_project
      );
    end if;

    if new.current_progress is not null and new.current_progress <> 0 then
      v_rate := public.realtime_progress_rate(new);
      v_delta := new.current_progress * v_rate;
      perform public.insert_realtime_log(
        v_user_id,
        new.project_id,
        new.id,
        'current_progress',
        '0',
        new.current_progress::text,
        v_delta,
        v_task,
        v_project
      );
    end if;

    return new;
  end if;

  -- UPDATE
  if old.name is distinct from new.name then
    perform public.insert_realtime_log(
      v_user_id, new.project_id, new.id, 'task_name', old.name, new.name, 0, v_task, v_project
    );
  end if;

  if old.type is distinct from new.type then
    perform public.insert_realtime_log(
      v_user_id, new.project_id, new.id, 'task_type', old.type::text, new.type::text, 0, v_task, v_project
    );
  end if;

  if old.scaling_modifier is distinct from new.scaling_modifier then
    perform public.insert_realtime_log(
      v_user_id, new.project_id, new.id, 'scaling_modifier',
      old.scaling_modifier::text, new.scaling_modifier::text, 0, v_task, v_project
    );
  end if;

  if old.scripting_modifier is distinct from new.scripting_modifier then
    perform public.insert_realtime_log(
      v_user_id, new.project_id, new.id, 'scripting_modifier',
      old.scripting_modifier::text, new.scripting_modifier::text, 0, v_task, v_project
    );
  end if;

  if old.script_length is distinct from new.script_length then
    perform public.insert_realtime_log(
      v_user_id, new.project_id, new.id, 'script_length',
      old.script_length::text, new.script_length::text, 0, v_task, v_project
    );
  end if;

  if old.unit_count is distinct from new.unit_count then
    perform public.insert_realtime_log(
      v_user_id, new.project_id, new.id, 'unit_count',
      old.unit_count::text, new.unit_count::text, 0, v_task, v_project
    );
  end if;

  if old.unit_length is distinct from new.unit_length then
    perform public.insert_realtime_log(
      v_user_id, new.project_id, new.id, 'unit_length',
      old.unit_length::text, new.unit_length::text, 0, v_task, v_project
    );
  end if;

  if old.current_progress is distinct from new.current_progress then
    v_rate := public.realtime_progress_rate(new);
    v_delta := (new.current_progress - old.current_progress) * v_rate;
    perform public.insert_realtime_log(
      v_user_id,
      new.project_id,
      new.id,
      'current_progress',
      old.current_progress::text,
      new.current_progress::text,
      v_delta,
      v_task,
      v_project
    );
  end if;

  return new;
end;
$$;

create or replace function public.log_project_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empty_task public.tasks;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  v_empty_task := null;

  if old.name is distinct from new.name then
    perform public.insert_realtime_log(
      new.user_id, new.id, null, 'project_name', old.name, new.name, 0, v_empty_task, new
    );
  end if;

  if old.video_length is distinct from new.video_length then
    perform public.insert_realtime_log(
      new.user_id, new.id, null, 'video_length',
      old.video_length::text, new.video_length::text, 0, v_empty_task, new
    );
  end if;

  if old.tag is distinct from new.tag then
    perform public.insert_realtime_log(
      new.user_id, new.id, null, 'project_tag',
      old.tag, new.tag, 0, v_empty_task, new
    );
  end if;

  if old.series is distinct from new.series then
    perform public.insert_realtime_log(
      new.user_id, new.id, null, 'project_series',
      old.series, new.series, 0, v_empty_task, new
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_realtime_log_trg on public.tasks;
create trigger tasks_realtime_log_trg
  after insert or update or delete on public.tasks
  for each row execute function public.log_task_changes();

drop trigger if exists projects_realtime_log_trg on public.projects;
create trigger projects_realtime_log_trg
  after update on public.projects
  for each row execute function public.log_project_changes();

alter table public.realtime_logs enable row level security;

drop policy if exists "realtime_logs_select_own" on public.realtime_logs;
create policy "realtime_logs_select_own"
  on public.realtime_logs for select using (auth.uid() = user_id);

drop policy if exists "realtime_logs_insert_own" on public.realtime_logs;
create policy "realtime_logs_insert_own"
  on public.realtime_logs for insert with check (auth.uid() = user_id);

drop policy if exists "realtime_logs_update_own" on public.realtime_logs;
create policy "realtime_logs_update_own"
  on public.realtime_logs for update using (auth.uid() = user_id);

drop policy if exists "realtime_logs_delete_own" on public.realtime_logs;
create policy "realtime_logs_delete_own"
  on public.realtime_logs for delete using (auth.uid() = user_id);
