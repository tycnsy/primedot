-- censaySplit / external-app task settings.
-- Existing rows receive defaults: subsplit_length = 60 (00:01:00), source_timecode_based = false.

alter table public.tasks
  add column if not exists subsplit_length integer not null default 60,
  add column if not exists source_timecode_based boolean not null default false;

alter table public.template_tasks
  add column if not exists subsplit_length integer not null default 60,
  add column if not exists source_timecode_based boolean not null default false;

alter table public.tasks
  drop constraint if exists tasks_subsplit_length_chk;

alter table public.tasks
  add constraint tasks_subsplit_length_chk check (subsplit_length >= 0);

alter table public.template_tasks
  drop constraint if exists template_tasks_subsplit_length_chk;

alter table public.template_tasks
  add constraint template_tasks_subsplit_length_chk check (subsplit_length >= 0);
