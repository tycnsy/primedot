-- prime. — per-task grouping settings for censaySplit

alter table public.tasks
  add column if not exists grouping_progress integer,
  add column if not exists groupable boolean not null default true;

alter table public.template_tasks
  add column if not exists grouping_progress integer,
  add column if not exists groupable boolean not null default true;
