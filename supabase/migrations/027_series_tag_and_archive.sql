-- Relate series to a tag (by name, matching existing name-based design) and
-- support archiving tags and series so they can be hidden from dropdowns while
-- remaining attached to existing projects.

alter table public.project_series
  add column if not exists tag text;

alter table public.project_series
  add column if not exists archived_at timestamptz;

alter table public.project_tags
  add column if not exists archived_at timestamptz;

create index if not exists project_series_user_archived_idx
  on public.project_series(user_id, archived_at);

create index if not exists project_tags_user_archived_idx
  on public.project_tags(user_id, archived_at);
