alter table public.projects
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at asc, id asc
    ) - 1 as next_sort_order
  from public.projects
)
update public.projects p
set sort_order = ranked.next_sort_order
from ranked
where p.id = ranked.id
  and p.sort_order is null;

update public.projects
set sort_order = 0
where sort_order is null;

alter table public.projects
  alter column sort_order set default 0;

alter table public.projects
  alter column sort_order set not null;

create index if not exists projects_user_sort_order_idx
  on public.projects(user_id, sort_order);
