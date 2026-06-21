-- Subprojects: single-level parent/child hierarchy on projects.

alter table public.projects
  add column if not exists parent_id uuid references public.projects(id) on delete cascade;

create index if not exists projects_parent_id_idx on public.projects(parent_id);

-- A subproject cannot itself be a parent of another project.
create or replace function public.projects_block_nested_subprojects()
returns trigger
language plpgsql
as $$
declare
  parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select parent_id into parent_parent from public.projects where id = new.parent_id;
  if parent_parent is not null then
    raise exception 'projects: cannot nest subprojects more than one level deep';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_block_nested_subprojects_trg on public.projects;
create trigger projects_block_nested_subprojects_trg
  before insert or update of parent_id on public.projects
  for each row execute function public.projects_block_nested_subprojects();
