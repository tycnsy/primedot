-- Planning-only rate relating scripting/custom tasks to finished video length.
-- custom:    units per 1 minute of finished video
-- scripting: minutes (of script) per 1 minute of finished video
-- Does not participate in task_length / progress calculations.

alter table public.tasks
  add column if not exists video_rate numeric;

alter table public.template_tasks
  add column if not exists video_rate numeric;

alter table public.tasks
  drop constraint if exists tasks_video_rate_chk;

alter table public.tasks
  add constraint tasks_video_rate_chk check (
    video_rate is null or video_rate >= 0
  );

alter table public.template_tasks
  drop constraint if exists template_tasks_video_rate_chk;

alter table public.template_tasks
  add constraint template_tasks_video_rate_chk check (
    video_rate is null or video_rate >= 0
  );
