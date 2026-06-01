alter table public.project_templates
  add column if not exists archived_at timestamptz;

alter table public.project_templates
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at asc, id asc
    ) - 1 as next_sort_order
  from public.project_templates
)
update public.project_templates t
set sort_order = ranked.next_sort_order
from ranked
where t.id = ranked.id
  and t.sort_order is null;

update public.project_templates
set sort_order = 0
where sort_order is null;

alter table public.project_templates
  alter column sort_order set default 0;

alter table public.project_templates
  alter column sort_order set not null;

create index if not exists project_templates_user_archived_idx
  on public.project_templates(user_id, archived_at);

create index if not exists project_templates_user_sort_order_idx
  on public.project_templates(user_id, sort_order);
