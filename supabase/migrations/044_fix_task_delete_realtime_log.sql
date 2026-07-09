-- Fix task delete rolling back: AFTER DELETE trigger cannot insert realtime_logs.task_id
-- referencing the row being removed (FK violation 23503). Task snapshot columns still
-- capture name/type/progress from p_task.

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
      null,
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
