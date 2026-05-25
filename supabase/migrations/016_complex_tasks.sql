-- Complex Tasks
-- A "complex" scaling task wraps N scaling subtasks behind a Compressed/Expanded
-- mode toggle. Subtasks always persist; compression is a UI/mode flag.
--
-- Schema additions:
--   tasks.parent_id      uuid (nullable) — self-FK to the complex parent task
--   tasks.complex_mode   enum (nullable) — mode flag, only set on parent tasks
--
-- Constraints:
--   * Only scaling tasks can be part of the complex hierarchy.
--   * complex_mode lives on the parent (parent_id IS NULL); subtasks (parent_id
--     IS NOT NULL) must have complex_mode IS NULL.
--   * One level of nesting only (a subtask cannot itself have subtasks),
--     enforced by trigger.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'complex_mode') then
    create type complex_mode as enum ('compressed', 'expanded');
  end if;
end $$;

alter table public.tasks
  add column if not exists parent_id    uuid references public.tasks(id) on delete cascade,
  add column if not exists complex_mode complex_mode;

create index if not exists tasks_parent_id_idx on public.tasks(parent_id);

-- Only scaling tasks participate in the complex hierarchy.
alter table public.tasks
  drop constraint if exists tasks_complex_scaling_only_chk;
alter table public.tasks
  add constraint tasks_complex_scaling_only_chk check (
    (parent_id is null and complex_mode is null) or type = 'scaling'
  );

-- complex_mode is only valid on a parent (a task with no parent itself).
alter table public.tasks
  drop constraint if exists tasks_mode_only_on_parent_chk;
alter table public.tasks
  add constraint tasks_mode_only_on_parent_chk check (
    not (parent_id is not null and complex_mode is not null)
  );

-- Prevent multi-level nesting: a task whose parent_id is set must reference
-- a parent that itself has parent_id null.
create or replace function public.tasks_block_nested_subtasks()
returns trigger
language plpgsql
as $$
declare
  parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select parent_id into parent_parent from public.tasks where id = new.parent_id;
  if parent_parent is not null then
    raise exception 'tasks: cannot nest subtasks more than one level deep';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_block_nested_subtasks_trg on public.tasks;
create trigger tasks_block_nested_subtasks_trg
  before insert or update of parent_id on public.tasks
  for each row execute function public.tasks_block_nested_subtasks();
