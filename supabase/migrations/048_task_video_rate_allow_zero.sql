-- Allow video_rate = 0 to mark scripting/custom tasks as N/A
-- (no direct correlation to finished video length).

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
