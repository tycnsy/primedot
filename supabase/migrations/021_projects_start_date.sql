alter table public.projects
  add column if not exists start_date timestamptz;

update public.projects
  set start_date = created_at
  where start_date is null;

alter table public.projects
  alter column start_date set default now(),
  alter column start_date set not null;
