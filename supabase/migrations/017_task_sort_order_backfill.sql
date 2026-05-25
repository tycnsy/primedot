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
  and t.sort_order is distinct from ranked.next_sort_order;
