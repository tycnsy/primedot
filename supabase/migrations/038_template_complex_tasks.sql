-- Complex task support for template_tasks (mirrors tasks table)

alter table public.template_tasks
  add column if not exists parent_id    uuid references public.template_tasks(id) on delete cascade,
  add column if not exists complex_mode complex_mode;

create index if not exists template_tasks_parent_id_idx on public.template_tasks(parent_id);

-- Only scaling tasks participate in the complex hierarchy.
alter table public.template_tasks
  drop constraint if exists template_tasks_complex_scaling_only_chk;
alter table public.template_tasks
  add constraint template_tasks_complex_scaling_only_chk check (
    (parent_id is null and complex_mode is null) or type = 'scaling'
  );

-- complex_mode is only valid on a parent (a task with no parent itself).
alter table public.template_tasks
  drop constraint if exists template_tasks_mode_only_on_parent_chk;
alter table public.template_tasks
  add constraint template_tasks_mode_only_on_parent_chk check (
    not (parent_id is not null and complex_mode is not null)
  );

-- Prevent multi-level nesting: a task whose parent_id is set must reference
-- a parent that itself has parent_id null.
create or replace function public.template_tasks_block_nested_subtasks()
returns trigger
language plpgsql
as $$
declare
  parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select parent_id into parent_parent from public.template_tasks where id = new.parent_id;
  if parent_parent is not null then
    raise exception 'template_tasks: cannot nest subtasks more than one level deep';
  end if;
  return new;
end;
$$;

drop trigger if exists template_tasks_block_nested_subtasks_trg on public.template_tasks;
create trigger template_tasks_block_nested_subtasks_trg
  before insert or update of parent_id on public.template_tasks
  for each row execute function public.template_tasks_block_nested_subtasks();
