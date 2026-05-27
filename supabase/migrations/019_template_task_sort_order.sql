alter table public.template_tasks
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by template_id
      order by created_at asc, id asc
    ) - 1 as next_sort_order
  from public.template_tasks
)
update public.template_tasks t
set sort_order = ranked.next_sort_order
from ranked
where t.id = ranked.id
  and t.sort_order is null;

update public.template_tasks
set sort_order = 0
where sort_order is null;

alter table public.template_tasks
  alter column sort_order set default 0;

alter table public.template_tasks
  alter column sort_order set not null;

create index if not exists template_tasks_template_sort_order_idx
  on public.template_tasks(template_id, sort_order);
