-- prime. — Persist custom order for long-term goals

alter table public.goals_long
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at desc, id desc
    ) - 1 as next_sort_order
  from public.goals_long
)
update public.goals_long as g
set sort_order = ranked.next_sort_order
from ranked
where g.id = ranked.id
  and g.sort_order is null;

alter table public.goals_long
  alter column sort_order set default 0;

alter table public.goals_long
  alter column sort_order set not null;

create index if not exists goals_long_user_archived_sort_idx
  on public.goals_long(user_id, archived_at, sort_order, created_at desc);
