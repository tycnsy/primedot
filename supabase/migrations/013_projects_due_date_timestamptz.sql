-- Upgrade projects.due_date from date to timestamptz.
-- Existing values are interpreted as midnight UTC to preserve the stored day.
alter table public.projects
alter column due_date type timestamptz
using (
  case
    when due_date is null then null
    else due_date::timestamp at time zone 'UTC'
  end
);
