-- Sub-templates: single-level parent/child hierarchy on project_templates.

alter table public.project_templates
  add column if not exists parent_id uuid references public.project_templates(id) on delete cascade;

create index if not exists project_templates_parent_id_idx on public.project_templates(parent_id);

create or replace function public.project_templates_block_nested_subtemplates()
returns trigger
language plpgsql
as $$
declare
  parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select parent_id into parent_parent from public.project_templates where id = new.parent_id;
  if parent_parent is not null then
    raise exception 'project_templates: cannot nest sub-templates more than one level deep';
  end if;
  return new;
end;
$$;

drop trigger if exists project_templates_block_nested_subtemplates_trg on public.project_templates;
create trigger project_templates_block_nested_subtemplates_trg
  before insert or update of parent_id on public.project_templates
  for each row execute function public.project_templates_block_nested_subtemplates();
