-- prime. — exclude new tasks from groupings by default

alter table public.tasks
  alter column groupable set default false;

alter table public.template_tasks
  alter column groupable set default false;
