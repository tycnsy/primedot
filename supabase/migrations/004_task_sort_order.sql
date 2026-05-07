alter table public.tasks
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by project_id
      order by created_at asc, id asc
    ) - 1 as next_sort_order
  from public.tasks
)
update public.tasks t
set sort_order = ranked.next_sort_order
from ranked
where t.id = ranked.id
  and t.sort_order is null;

update public.tasks
set sort_order = 0
where sort_order is null;

alter table public.tasks
  alter column sort_order set default 0;

alter table public.tasks
  alter column sort_order set not null;

create index if not exists tasks_project_sort_order_idx
  on public.tasks(project_id, sort_order);
