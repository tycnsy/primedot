-- Add a per-project setting to keep true_deadline in sync with due_date.
alter table public.projects
add column if not exists sync_true_deadline_with_due_date boolean not null default false;
