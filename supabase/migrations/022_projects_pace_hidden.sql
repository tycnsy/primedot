-- prime. — Persist pace card / pace grid visibility per project.
-- A project with pace_hidden = true is hidden from the Pace Grid, the pace
-- sidebar, and the Timer page. Stored on the project so visibility persists
-- across devices/instances instead of only in browser localStorage.

alter table public.projects
  add column if not exists pace_hidden boolean not null default false;
